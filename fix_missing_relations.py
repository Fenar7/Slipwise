import re

with open("prisma/schema.prisma", "r") as f:
    content = f.read()

missing_org_relations = """  typingSessions               TypingSession[]
  conversationAttachments      ConversationAttachment[]
  messagingAttachmentIndices   MessagingAttachmentIndex[]
  messagingTasks               MessagingTask[]
  conversationMeetings         ConversationMeeting[]
  calendarConnections          CalendarConnection[]
  messagingAuditEvents         MessagingAuditEvent[]
  conversationEventLogs        ConversationEventLog[]
  retentionPolicies            RetentionPolicy[]
  downstreamCheckpoints        DownstreamConsumptionCheckpoint[]
  messagingNotificationPrefs   MessagingNotificationPreference[]
  messagingFollowUps           MessagingFollowUp[]"""

content = re.sub(
    r"(  presenceSessions             PresenceSession\[\])",
    lambda m: m.group(1) + "\n" + missing_org_relations,
    content
)

with open("prisma/schema.prisma", "w") as f:
    f.write(content)
