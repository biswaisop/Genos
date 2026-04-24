from Tools.shell_tools import run_shell

def shell_agent(user_input: str) -> str:
    # dumb version first
    if "list" in user_input:
        command = "dir"  # Windows
    elif "python" in user_input:
        command = "dir *.py"
    else:
        command = "echo command not understood"
    
    print("DEBUG: running command:", command)

    return run_shell(command)