import hvac
import os
import shutil
import tempfile
from dotenv import load_dotenv

from services.key_gen import generate_keypair

load_dotenv()

client = hvac.Client(
    url=os.getenv('VAULT_ADDR', 'http://127.0.0.1:8200'),
    token=os.getenv('VAULT_TOKEN')
)


def store_ssh_key(hostname: str, username: str) -> str:
    """
    Generates an Ed25519 SSH key pair for a server identified by hostname@username.

    Steps:
    1. Generate the public/private key pair in memory.
    2. Write both keys to a temporary directory named `hostname@username` for any
       intermediate use (e.g. SCP, Ansible). The directory is cleaned up after Vault storage.
    3. Store ONLY the private key in HashiCorp Vault at path:
           ssh-keys/<hostname>@<username>
    4. Return the public key string so the caller can hand it to the user.

    Args:
        hostname: The IP address or DNS hostname of the remote server.
        username: The SSH username on the remote server.

    Returns:
        The OpenSSH-formatted public key string.
    """
    private_key, public_key = generate_keypair()

    # Temporary directory named hostname@username as specified
    dir_name = f"{hostname}@{username}"
    temp_dir = os.path.join(tempfile.gettempdir(), dir_name)
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # Write both keys to temp dir
        with open(os.path.join(temp_dir, "id_ed25519"), "w") as f:
            f.write(private_key)
        with open(os.path.join(temp_dir, "id_ed25519.pub"), "w") as f:
            f.write(public_key)

        # Store private key in Vault KV v2 — public key is safe to store too for reference
        vault_path = f"ssh-keys/{dir_name}"
        client.secrets.kv.v2.create_or_update_secret(
            path=vault_path,
            secret={
                "private_key": private_key,
                "public_key": public_key,
                "hostname": hostname,
                "username": username,
            }
        )
    finally:
        # Always clean up the temporary directory
        shutil.rmtree(temp_dir, ignore_errors=True)

    return public_key


def get_ssh_key(hostname: str, username: str) -> dict:
    """
    Retrieves the stored SSH key pair for a server from Vault.

    Args:
        hostname: The IP address or DNS hostname of the remote server.
        username: The SSH username on the remote server.

    Returns:
        A dict with 'private_key' and 'public_key' fields.

    Raises:
        KeyError: If no secret is found at the expected Vault path.
    """
    vault_path = f"ssh-keys/{hostname}@{username}"
    response = client.secrets.kv.v2.read_secret_version(path=vault_path)
    return response["data"]["data"]