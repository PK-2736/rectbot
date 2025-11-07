function normalizeRecruitId(messageOrRecruitId) {
  if (!messageOrRecruitId) return '';
  const str = String(messageOrRecruitId);
  return str.length > 8 ? str.slice(-8) : str;
}

module.exports = { normalizeRecruitId };
