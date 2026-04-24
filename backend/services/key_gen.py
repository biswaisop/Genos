from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

def generate_keypair(comment: str = "genos-key") -> tuple[str, str]:
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=4096,
    )

    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption()
    )

    public_key_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH
    )

    public_key = f"{public_key_bytes.decode().strip()} {comment}"
    return private_bytes.decode(), public_key