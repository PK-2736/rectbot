/**
 * Parameter objects for complex functions to reduce parameter count
 * and improve code maintainability (INTRODUCE PARAMETER OBJECT pattern)
 */

/**
 * Creates a context object for sending announcements
 * @param {Object} params - Parameters
 * @returns {Object} Announcement context
 */
function createAnnouncementContext(params) {
  return {
    interaction: params.interaction,
    selectedNotificationRole: params.selectedNotificationRole,
    configuredIds: params.configuredIds,
    image: params.image,
    container: params.container,
    guildSettings: params.guildSettings,
    user: params.user,
    extraComponents: params.extraComponents || []
  };
}

/**
 * Creates a context object for scheduling start time notifications
 * @param {Object} params - Parameters
 * @returns {Object} Notification schedule context
 */
function createNotificationScheduleContext(params) {
  return {
    finalRecruitData: params.finalRecruitData,
    interaction: params.interaction,
    actualMessageId: params.actualMessageId,
    actualRecruitId: params.actualRecruitId,
    guildSettings: params.guildSettings
  };
}

/**
 * Creates a context object for building closed recruitment cards
 * @param {Object} params - Parameters
 * @returns {Object} Closed card context
 */
function createClosedCardContext(params) {
  return {
    recruitStyle: params.recruitStyle,
    data: params.data,
    messageId: params.messageId,
    interaction: params.interaction,
    originalMessage: params.originalMessage
  };
}

/**
 * Creates a context object for sending and updating initial messages
 * @param {Object} params - Parameters
 * @returns {Object} Initial message context
 */
function createInitialMessageContext(params) {
  return {
    interaction: params.interaction,
    selectedNotificationRole: params.selectedNotificationRole,
    configuredNotificationRoleIds: params.configuredNotificationRoleIds,
    image: params.image,
    container: params.container,
    guildSettings: params.guildSettings,
    user: params.user,
    recruitDataObj: params.recruitDataObj,
    style: params.style,
    panelColor: params.panelColor,
    participantText: params.participantText,
    subHeaderText: params.subHeaderText,
    currentParticipants: params.currentParticipants
  };
}

/**
 * Creates a context object for building containers
 * @param {Object} params - Parameters
 * @returns {Object} Container build context
 */
function createContainerContext(params) {
  return {
    recruitDataObj: params.recruitDataObj,
    user: params.user,
    participantText: params.participantText,
    subHeaderText: params.subHeaderText,
    interaction: params.interaction,
    accentColor: params.accentColor,
    recruitIdText: params.recruitIdText
  };
}

module.exports = {
  createAnnouncementContext,
  createNotificationScheduleContext,
  createClosedCardContext,
  createInitialMessageContext,
  createContainerContext
};
