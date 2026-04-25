"""REST routes powering the in-site notification bell."""

from fastapi import APIRouter, Depends, HTTPException, status

from core.auth import get_current_user
from core.notifications import (
    delete_notification,
    list_for_user,
    mark_all_read,
    mark_read,
    unread_count,
)
from schema.notifications import NotificationListResponse
from schema.user import UserInDB


NotificationRouter = APIRouter()


@NotificationRouter.get("/", response_model=NotificationListResponse)
async def get_notifications(
    only_unread: bool = False,
    current_user: UserInDB = Depends(get_current_user),
):
    """List notifications for the current user (newest first)."""
    notifications = await list_for_user(current_user.id, only_unread=only_unread)
    unread = await unread_count(current_user.id)
    return NotificationListResponse(
        notifications=notifications,
        unread_count=unread,
    )


@NotificationRouter.patch("/{notification_id}/read")
async def mark_one_read(
    notification_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    """Mark a single notification as read."""
    ok = await mark_read(current_user.id, notification_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return {"status": "ok"}


@NotificationRouter.patch("/read-all")
async def mark_everything_read(
    current_user: UserInDB = Depends(get_current_user),
):
    """Mark every unread notification for this user as read."""
    count = await mark_all_read(current_user.id)
    return {"status": "ok", "updated": count}


@NotificationRouter.delete("/{notification_id}")
async def remove_notification(
    notification_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    """Delete a notification (used as 'Dismiss' on anomaly alerts)."""
    ok = await delete_notification(current_user.id, notification_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    return {"status": "ok"}
