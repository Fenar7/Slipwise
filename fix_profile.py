import re

with open("prisma/schema.prisma", "r") as f:
    content = f.read()

# remove the block I added to Profile
content = re.sub(
    r"  // Internal Messaging\n  conversationParticipants ConversationParticipant\[\]\n  messageReactions         MessageReaction\[\]\n  messageMentions          MessageMention\[\]\n  presenceSessions         PresenceSession\[\]\n  typingSessions           TypingSession\[\]\n",
    "",
    content
)

with open("prisma/schema.prisma", "w") as f:
    f.write(content)
