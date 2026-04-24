import subprocess

def run_shell(command: str) -> str:
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True
        )
        return result.stdout if result.stdout else result.stderr
    except Exception as e:
        return str(e)