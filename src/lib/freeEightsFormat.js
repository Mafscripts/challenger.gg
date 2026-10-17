export const FREE_EIGHTS_FORMATS = ["2v2", "3v3", "4v4"];

// Older rooms have no format metadata and remain 4v4.
export function freeEightsTeamSize(match) {
  if (FREE_EIGHTS_FORMATS.includes(match?.team_size)) return Number(match.team_size[0]);
  const size = Number(match?.required_players_per_team);
  return [2, 3, 4].includes(size) ? size : 4;
}

export const freeEightsCapacity = (match) => freeEightsTeamSize(match) * 2;
export const eightsMajorityVotes = (match) => freeEightsTeamSize(match) + 1;

// Anchor player zero to avoid counting the same split with swapped team labels.
export function freeEightsTeamPartitions(playerCount) {
  const partitions = [];
  const visit = (indices, next) => {
    if (indices.length === playerCount / 2) {
      partitions.push(new Set(indices));
      return;
    }
    for (let index = next; index <= playerCount - (playerCount / 2 - indices.length); index++) {
      visit([...indices, index], index + 1);
    }
  };
  if ([4, 6, 8].includes(playerCount)) visit([0], 1);
  return partitions;
}
