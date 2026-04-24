import paramiko
import os
import time
import threading
from typing import Optional
import re



class PersistentSSHConnector:
    """
    One SSH connection per user session.
    Persistent shell channel — cd context preserved.
    One handshake, many commands.
    """
    
    def __init__(self, host: str, username: str, password: Optional[str] = None, key_path: Optional[str] = None, port: int = 2222,):
        self.host = host
        self.username = username
        self.password = password
        self.port = port 
        self._client: Optional[paramiko.SSHClient] = None
        self._channel: Optional[paramiko.channel] = None
        self._lock = threading.Lock()
        self._password = password
        self._key_path = key_path
        self._sentinel = f"GENOS_DONE_{os.getpid()}"
        
    def connect(self) -> bool:
        """
        Open SSH connection and start persistent shell.
        Call once per session — not per command.
        """
        
        try:
            self._client = paramiko.SSHClient()
            self._client.set_missing_host_key_policy(
                paramiko.AutoAddPolicy()
            )
            
            connect_kwargs = dict(
                hostname = self.host,
                port = self.port,
                username = self.username,
                timeout = 10,
            )
            
            if self._key_path:
                connect_kwargs["key_filename"] = self._key_path
            elif self._password:
                self.connect_kwargs[self.password] = self._password
            self._client.connect(**connect_kwargs)
            
            self._channel = self._client.invoke_shell(
                width=220, height=50
            )
            
            self._channel.settimeout(30)
            
            self._drain(timeout = 3)
            
            self._raw_exec("stty -echo")
            self._raw_exec("export PS1=''")
            self._raw_exec("export TERM=dumb")
            self._sentinel = f"GENOS_DONE_{os.getpid()}"
            return True
        
        except paramiko.AuthenticationException:
            raise ConnectionError("SSH authentication failed. Check credentials.")
        except paramiko.SSHException as e:
            raise ConnectionError(f"SSH error: {e}")
        except Exception as e:
            raise ConnectionError(f"Connection failed: {e}")
        
    def disconnect(self):
        """Close the persistent connection"""
        try:
            if self._channel:
                self._channel.close()
                
            if self._client:
                self._client.close()
        except Exception:
            pass
        finally:
            self._channel = None
            self._client = None
    
    @property
    def is_connected(self) -> bool:
        return (
            self._client  is not None and
            self._channel is not None and
            self._client.get_transport() is not None and
            self._client.get_transport().is_active()
        )
        
    # ── Command execution ──────────────────────────
    
    def exec(self, command: str, timeout: int = 30) -> str:
        """
        Execute a command on the persistent shell.
        cd context is preserved across calls.
        Thread-safe — one command at a time.
        """
        if not self.is_connected:
            return "Error: not connected. Call connect() first."

        with self._lock:
            return self._exec_with_sentinel(command, timeout)
        
    
    def _exec_with_sentinel(self, command: str, timeout: int) -> str:
        self._drain(timeout=0.2)
        full_cmd = f"{command} ; echo '{self._sentinel}'\n"
        self._channel.send(full_cmd)
        
        output = ""
        start  = time.time()

        while True:
            if time.time() - start > timeout:
                return self._clean_output(output, command)

            if self._channel.recv_ready():
                chunk = self._channel.recv(4096).decode(
                    "utf-8", errors="replace"
                )
                output += chunk

                if self._sentinel in output:
                    output = output.split(self._sentinel)[0]
                    return self._clean_output(output, command)
            else:
                time.sleep(0.05)

        # return self._clean_output(output, command)
    
    def _raw_exec(self, command: str):
        """
        Send a command without reading output.
        Used for setup commands during connect().
        """
        self._channel.send(f"{command}\n")
        time.sleep(0.3)
        self._drain(timeout=0.5)
        
    def _drain(self, timeout: float = 1.0):
        """Read and discard anything in the buffer."""
        end = time.time() + timeout
        while time.time() < end:
            if self._channel and self._channel.recv_ready():
                self._channel.recv(4096)
            else:
                time.sleep(0.05)
                
    def _clean_output(self, raw: str, command: str, sentinel: str = "") -> str:
        # Remove ANSI escape sequences
        ansi = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        cleaned = ansi.sub("", raw)

        # Remove sentinel if it leaked through
        if sentinel:
            cleaned = cleaned.replace(sentinel, "")

        # Remove the echoed command line
        lines = cleaned.split("\n")
        lines = [
            l for l in lines
            if l.strip() not in (command.strip(), sentinel, "")
            or l.strip() == ""  # keep blank lines for formatting
        ]

        # Remove blank lines at start and end
        result = "\n".join(lines).strip()

        if len(result) > 2500:
            result = result[:2500] + "\n[output truncated]"

        return result or "Done."

    # ── Context helpers ────────────────────────────

    def get_cwd(self) -> str:
        """Get current working directory."""
        return self.exec("pwd")

    def get_whoami(self) -> str:
        """Get current user."""
        return self.exec("whoami")