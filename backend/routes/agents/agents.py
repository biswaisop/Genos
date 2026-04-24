from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command
from langchain_core.messages import HumanMessage, AIMessage
import json
import logging
from jose import JWTError, jwt

from graph import build_graph, State
from core.auth import SECRET_KEY, ALGORITHM
from core.chat_memory import ChatMemoryService
from core.serverutils import getserverbyid
from core.userutils import getuserbyemail
from services.vault import get_ssh_key

router = APIRouter()
logger = logging.getLogger(__name__)

# Global checkpointer for development (in-memory state)
checkpointer = MemorySaver()

memory = ChatMemoryService()

# Cache compiled graphs per host/user
compiled_graphs = {}

def _thread_id(hostname: str, username: str) -> str:
    return f"{hostname}@{username}"


def get_agent_graph(hostname: str, username: str, *, port: int, key_material: str):
    graph_id = _thread_id(hostname, username)
    if graph_id not in compiled_graphs:
        compiled_graphs[graph_id] = build_graph(
            hostname,
            username,
            port=port,
            key_material=key_material,
            checkpointer=checkpointer,
        )
    return compiled_graphs[graph_id]


async def _authenticate_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401, reason="Missing token")
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
    except JWTError:
        await websocket.close(code=4401, reason="Invalid token")
        return None

    if not email:
        await websocket.close(code=4401, reason="Invalid token payload")
        return None

    user = await getuserbyemail(email)
    if not user:
        await websocket.close(code=4401, reason="User not found")
        return None

    return user

@router.websocket("/ws/{server_id}")
async def agent_websocket(websocket: WebSocket, server_id: str):
    """
    WebSocket endpoint for full interactive agent communication.
    Supports chat messages and handles LangGraph `interrupt()` pauses.
    """
    await websocket.accept()

    current_user = await _authenticate_websocket(websocket)
    if not current_user:
        return

    server = await getserverbyid(server_id)
    if not server:
        await websocket.send_json({"type": "error", "content": "Server not found."})
        await websocket.close(code=4404, reason="Server not found")
        return

    if str(server.owner_id) != str(current_user.id):
        await websocket.send_json({"type": "error", "content": "Not authorized for this server."})
        await websocket.close(code=4403, reason="Forbidden")
        return

    hostname = server.connection.host
    username = server.connection.username
    port = server.connection.port
    thread_id = _thread_id(hostname, username)

    try:
        vault_data = get_ssh_key(hostname=hostname, username=username)
        private_key_pem = vault_data["private_key"]
    except Exception as exc:
        await websocket.send_json({"type": "error", "content": f"Vault key retrieval failed: {exc}"})
        await websocket.close(code=1011, reason="Vault key retrieval failed")
        return

    agent_graph = get_agent_graph(hostname, username, port=port, key_material=private_key_pem)
    thread_config = {"configurable": {"thread_id": thread_id}}

    logger.info(f"WebSocket connected for {thread_id}")
    await websocket.send_json({"type": "info", "content": f"Connected to GenOS Agent on {thread_id}"})

    short_history = await memory.get_short_messages(thread_id, limit=20)
    if short_history:
        await websocket.send_json({"type": "history", "items": short_history})
    
    try:
        while True:
            data = await websocket.receive_text()
            
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                # Fallback to pure string if not JSON
                payload = {"message": data}
                
            # If payload has 'resume', it's answering a CONFIRM prompt
            if "resume" in payload:
                decision = payload["resume"].strip().lower()
                await memory.clear_pending_confirm(thread_id)
                
                # Verify if the graph is actually paused
                snapshot = agent_graph.get_state(thread_config)
                if snapshot.next:
                    await websocket.send_json({"type": "info", "content": f"Resuming with your decision: {decision}"})
                    
                    try:
                        command_id = str(uuid.uuid4())
                        result = await agent_graph.ainvoke(Command(resume=decision), config=thread_config)
                        await memory.log_command(
                            command_id=command_id,
                            user_id=str(current_user.id),
                            server_id=server_id,
                            session_id=thread_id,
                            raw_message=f"[resume]={decision}",
                            status="completed",
                            response="Resumed execution",
                            confirmed=decision in {"yes", "y"},
                        )
                    except Exception as e:
                        logger.error(f"Error resuming graph: {e}")
                        await websocket.send_json({"type": "error", "content": f"Execution error: {e}"})
                        continue
                else:
                    await websocket.send_json({"type": "error", "content": "No pending confirmation found. Please send a new command."})
                    continue
            else:
                # Normal command payload
                message = payload.get("message", "")
                if not message:
                    await websocket.send_json({"type": "error", "content": "Received empty message."})
                    continue

                await memory.touch_session(thread_id, str(current_user.id), server_id)
                await memory.append_short_message(thread_id, "user", message)

                command_id = str(uuid.uuid4())
                await memory.log_command(
                    command_id=command_id,
                    user_id=str(current_user.id),
                    server_id=server_id,
                    session_id=thread_id,
                    raw_message=message,
                    status="running",
                )
                
                init_state: State = {
                    "messages":         [HumanMessage(content=message)],
                    "user_id":          str(current_user.id),
                    "context":          "",
                    "proposed_command": "",
                    "tool_used":        "",
                    "critic_verdict":   {},
                    "approved":         False,
                    "execution_output": "",
                }
                
                await websocket.send_json({"type": "info", "content": "Agent is processing..."})
                
                try:
                    result = await agent_graph.ainvoke(init_state, config=thread_config)
                    if result.get("proposed_command"):
                        await websocket.send_json({
                            "type": "thinking",
                            "stage": "planner",
                            "proposed_command": result.get("proposed_command"),
                            "tool_used": result.get("tool_used", "unknown"),
                        })
                    if result.get("critic_verdict"):
                        await websocket.send_json({
                            "type": "thinking",
                            "stage": "critic",
                            "verdict": result.get("critic_verdict"),
                        })
                except Exception as e:
                    logger.error(f"Error invoking graph: {e}")
                    await websocket.send_json({"type": "error", "content": f"Graph execution error: {e}"})
                    await memory.log_command(
                        command_id=command_id,
                        user_id=str(current_user.id),
                        server_id=server_id,
                        session_id=thread_id,
                        raw_message=message,
                        status="failed",
                        response=str(e),
                    )
                    continue
                
            # Post execution/resume: Check if paused for human approval again
            snapshot = agent_graph.get_state(thread_config)
            
            if snapshot.next:
                # We hit an interrupt
                interrupt_val = snapshot.tasks[0].interrupts[0].value
                await memory.set_pending_confirm(thread_id, {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "interrupt": interrupt_val,
                })
                await websocket.send_json({
                    "type": "confirm",
                    "message": interrupt_val.get("message", "Confirm this action?"),
                    "command": interrupt_val.get("proposed_command", ""),
                    "risk_level": interrupt_val.get("risk_level", "medium")
                })
            else:
                # Finished executing completely
                # Extract the last AI message
                found_msg = False
                for msg in reversed(result["messages"]):
                    if isinstance(msg, AIMessage) and msg.content:
                        await websocket.send_json({"type": "output", "content": msg.content})
                        await memory.append_short_message(thread_id, "assistant", msg.content)

                        latest_user = ""
                        for user_msg in result["messages"]:
                            if isinstance(user_msg, HumanMessage):
                                latest_user = str(user_msg.content)
                                break

                        status_value = "blocked"
                        verdict = result.get("critic_verdict", {})
                        if verdict.get("decision", "").upper() == "ALLOW":
                            status_value = "completed"

                        await memory.log_command(
                            command_id=str(uuid.uuid4()),
                            user_id=str(current_user.id),
                            server_id=server_id,
                            session_id=thread_id,
                            raw_message=latest_user,
                            status=status_value,
                            response=msg.content,
                            proposed_command=result.get("proposed_command"),
                            required_confirmation=bool(verdict.get("decision", "").upper() == "CONFIRM"),
                            confirmed=bool(result.get("approved", False)),
                        )
                        found_msg = True
                        break
                
                if not found_msg:
                    await websocket.send_json({"type": "output", "content": "Task completed (no message returned)."})
                        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for {thread_id}")
    except Exception as e:
        logger.error(f"WebSocket unhandled error: {e}")