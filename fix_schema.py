import re

with open("prisma/schema.prisma", "r") as f:
    content = f.read()

# Append relations to Organization
org_relations = """  // Internal Messaging Platform — Phase 2
  conversations                Conversation[]
  conversationParticipants     ConversationParticipant[]
  conversationMessages         ConversationMessage[]
  conversationThreads          ConversationThread[]
  conversationDrafts           ConversationDraft[]
  messageReactions             MessageReaction[]
  messageMentions              MessageMention[]
  conversationReadStates       ConversationReadState[]
  presenceSessions             PresenceSession[]"""

content = re.sub(
    r"(model Organization \{.*?)(\n  @@index)",
    lambda m: m.group(1) + "\n" + org_relations + m.group(2),
    content,
    flags=re.DOTALL
)

# Append relations to Customer
cust_relations = """  conversations    Conversation[]
  conversationParticipants ConversationParticipant[]
  conversationMessages    ConversationMessage[]
  conversationReadStates ConversationReadState[]"""

content = re.sub(
    r"(model Customer \{.*?)(\n  @@index)",
    lambda m: m.group(1) + "\n" + cust_relations + m.group(2),
    content,
    flags=re.DOTALL
)

with open("prisma/schema.prisma", "w") as f:
    f.write(content)
