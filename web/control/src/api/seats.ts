import type { ControlSession, Seat } from "../app/lib/types";

export interface ControlSeatDescriptor {
  displayName: string;
  id: string;
  label: string;
  role: Seat["role"];
}

export function toSeatDescriptors(session: ControlSession): ControlSeatDescriptor[] {
  return session.seats.map((seat) => ({
    displayName: seat.displayName,
    id: seat.id,
    label: seat.label,
    role: seat.role,
  }));
}
