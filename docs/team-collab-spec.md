# Team collaboration features (architect modules 4 and 6) — spec for implementation

Source: requirements confirmed with Diletta and the team architect, 2026-11-14.

## Accounts and contacts
- On first visit each user enters: name, trade (architect / electrician / plumber / floor / wall / owner), email, phone.
- Stored on the server (`/collab/people`), visible to the team so anyone can contact anyone.

## Room chat (extends the existing Room Board)
- Per-room chat thread (messages already exist in `agent/collab.py`: add `author`, show name + trade + time).
- Direct message between two people (private thread).
- A message can carry an image attachment (see "3D screenshot note").
- A change in a room still flashes only that room on the drawing and notifies only the trades involved.

## Work timeline (module 6)
- One row per room, horizontal time axis **with hour precision** (e.g. 10:00–12:00 one trade, afternoon another).
- Each booking = {room, trade, person, start, end, what they do}. Block shows trade colour + what is being done.
- **Conflict** = same room, overlapping time. Show it **large and obvious**.
- Conflict is **pushed to both people's pages** so they resolve it. Until resolved, **the person who booked first keeps the slot** and keeps working.
- The later person sees the first person's **contact details** (email, phone) and a button to open a private chat.
- No conflict → no confirmation needed.
- Order dependencies (e.g. "fix wall before toilet") warn if violated.
- Demo data must be labelled "Demo schedule".

## Owner transparency (setting chosen by the owner)
1. results only; 2. only notified when there is a problem (e.g. a conflict); 3. sees everything including chats.

## 3D screenshot note
- In the 3D view: take a screenshot, write a short text note on it (drawn onto the image), and send it into a room chat or a private chat (e.g. architect shows a placed table to the client).
