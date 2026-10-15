export const AUTO_SETTLE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/** Catalog-owned choice follows conversation content, never a client's history page. */
export function projectChatSettlement(chat, metadata, now = Date.now()) {
  const choice = metadata.settlement;
  if (choice && choice.messageCount === Math.max(0, Number(chat.messageCount) || 0)) return choice.state === 'settled';
  const activityAt = Date.parse(chat.modifiedAt || chat.createdAt);
  return Number(chat.messageCount) > 0 && Number.isFinite(activityAt) && now - activityAt >= AUTO_SETTLE_AFTER_MS;
}
