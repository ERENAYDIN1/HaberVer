import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from ..models.log import LogAction


class LogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: LogAction
    actor_name: str | None
    entity_type: str
    entity_id: uuid.UUID | None
    entity_name: str | None
    detail: str | None
    created_at: datetime
