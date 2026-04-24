
from Agents.shell_agent import shell_agent
def main():
    while True:
        user_input = input(">> ")
        
        if user_input == "exit":
            break

        response = shell_agent(user_input)
        print(response)

if __name__ == "__main__":
    main()



