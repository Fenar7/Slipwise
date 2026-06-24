import re

with open("/tmp/feature_schema.prisma", "r") as f:
    feature_content = f.read()

# Extract from "Internal Messaging Platform — Phase 2" to the end of the messaging models
# The messaging models end right before "enum SequenceDocumentType" or similar, or we can just extract using regex
match = re.search(r"(// ─── Internal Messaging Platform — Phase 2 Domain Models.*?)(?=\n// ───|\Z)", feature_content, re.DOTALL)
if not match:
    # Try another delimiter
    match = re.search(r"(// ─── Internal Messaging Platform — Phase 2 Domain Models.*?)(?=\nmodel OrgDefaults)", feature_content, re.DOTALL)
    
if not match:
    # Try to extract up to the end if nothing else follows
    match = re.search(r"(// ─── Internal Messaging Platform — Phase 2 Domain Models.*)", feature_content, re.DOTALL)

messaging_models = match.group(1) if match else ""

with open("prisma/schema.prisma", "r") as f:
    master_content = f.read()

# Append to master
master_content += "\n\n" + messaging_models

# Inject relations
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

master_content = re.sub(
    r"(model Organization \{.*?)(\n  @@index)",
    lambda m: m.group(1) + "\n" + org_relations + m.group(2),
    master_content,
    flags=re.DOTALL
)

cust_relations = """  conversations    Conversation[]
  conversationParticipants ConversationParticipant[]
  conversationMessages    ConversationMessage[]
  conversationReadStates ConversationReadState[]"""

master_content = re.sub(
    r"(model Customer \{.*?)(\n  @@index)",
    lambda m: m.group(1) + "\n" + cust_relations + m.group(2),
    master_content,
    flags=re.DOTALL
)

user_relations = """  conversations    Conversation[]
  conversationParticipants ConversationParticipant[]
  conversationMessages    ConversationMessage[]
  conversationReadStates ConversationReadState[]"""

# If there's a User model or Member model we need to inject into that too?
# wait, in my previous output, I didn't see `model User` but `feature/internal-messaging-platform` might have added to `model Profile`.
# Let's check where feature_content added "conversation"
profile_relations = """  // Internal Messaging
  conversationParticipants ConversationParticipant[]
  messageReactions         MessageReaction[]
  messageMentions          MessageMention[]
  presenceSessions         PresenceSession[]
  typingSessions           TypingSession[]"""
  
master_content = re.sub(
    r"(model Profile \{.*?)(\n  @@index|\n  @@map)",
    lambda m: m.group(1) + "\n" + profile_relations + m.group(2),
    master_content,
    flags=re.DOTALL
)

with open("prisma/schema.prisma", "w") as f:
    f.write(master_content)
