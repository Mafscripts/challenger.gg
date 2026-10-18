// Polls include a new timestamp even when the room and Discord status are unchanged.
// Keep stable references so roster validation and the player controls can reuse work.
export function mergeRoomUpdate(previous, incoming) {
  if (!previous || previous.room.id !== incoming.room.id) return incoming;
  if (incoming.room.revision < previous.room.revision) return previous;
  const room = JSON.stringify(previous.room) === JSON.stringify(incoming.room) ? previous.room : incoming.room;
  const voice = JSON.stringify(previous.voice) === JSON.stringify(incoming.voice) ? previous.voice : incoming.voice;
  return room === previous.room && voice === previous.voice ? previous : { ...incoming, room, voice };
}
