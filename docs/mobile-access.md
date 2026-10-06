# Mobile access

Mobile access connects a phone to the agent chats running in Mr. Mak Desktop.
The computer keeps the CLI processes, their sign-ins and project files. The
phone can read conversations, send messages and images, resume a saved chat,
start an installed agent, and read Workspace reports.

## First connection

1. Install [Tailscale](https://tailscale.com/download) on your computer and phone.
   Sign in to the same Tailscale account on both and keep them connected.
2. Open Mr. Mak **Chats** and select the **phone icon** in the top bar.
3. Choose **Enable & show QR code**. If Tailscale requests HTTPS permission,
   follow its [Serve setup](https://tailscale.com/docs/features/tailscale-serve)
   and try again. On Windows, Tailscale may require administrator permission
   to configure Serve. You do not need to run agent chats as administrator.
4. Scan the QR code with your phone. Name the device and request a connection.
5. Compare the six-digit confirmation code on both screens, then choose
   **Connect phone** in Chats. A QR code alone does not grant access.
6. Add the page to your Home Screen through your browser. If the installed
   web app asks to connect again, enter the eight-digit connection code shown
   under a fresh desktop QR code and confirm it on the computer.

Every owner connects their own devices. No shared Mr. Mak server, public domain
or new model API key is required. Existing CLI account limits still apply.
Mr. Mak configures a private Tailscale Serve route on an available HTTPS port
between 8443 and 8446. It preserves existing routes and never enables Funnel.

## Using the phone

- **Active / History:** select a conversation. Pinned chats come first.
- **Conversation:** recent user and assistant messages from Codex or Claude's
  local history. Tool output stays in the terminal. The view is bounded to the
  recent transcript; native CLI history remains on the computer.
- **Terminal:** the real CLI screen for any supported agent, with scrolling,
  copy and buttons for Enter, Escape, arrows, Tab and Stop. Wide lines scroll
  sideways so opening a phone does not resize the desktop terminal.
- **Send:** sends a complete prompt to the selected CLI. Enter in the phone's
  text field adds a line break; use Send to submit. Your keyboard's dictation
  works in the same field.
- **Attach images:** uploads an image to the computer's `inbox/attachments`
  and inserts its path with the message. Other file types and a full remote
  file manager are not part of this version.
- **Results:** read active Workspace cards and their HTML or Markdown tabs.
  HTML previews are isolated and can read only their own report folder and
  the shared report styling. Desktop-only API calls, external embedded frames
  and reports outside the repository are not available in this viewer.

Selecting a tab, scrolling or opening a report on the phone does not select a
different tab on the desktop. Conversation contents and task activity are shared.
Reading a completed turn marks it seen across devices.

## Connections and delivery

Keep the computer awake, online and running Mr. Mak. Minimizing or hiding its
windows is fine. Quitting Mr. Mak or letting the computer sleep makes it
unavailable; closing the phone does not stop agents.

Drafts stay on the phone per chat. After a lost connection, **Retry** checks the
same message ID. The computer keeps a delivery receipt before writing to the
terminal. **Delivered to terminal** confirms the terminal write, not that an
agent accepted or completed the task. If delivery is uncertain, inspect the
terminal before unlocking the draft for a new attempt. Unsynchronised terminal
keystrokes should be entered from one device at a time.

The phone button in Chats shows connected and paired devices. **Disconnect**
revokes a device and closes its connections. **Turn off mobile access** stops
the mobile surface without stopping agent chats; paired devices can reconnect
when it is enabled again. Pairing codes expire after five minutes. A device's
pairing expires after 180 days and can be renewed with a new QR code.

Mobile access is off by default. Device credentials are stored as hashes in
the ignored runtime state; the phone holds its own HttpOnly session cookie.
It never receives the desktop control token or model API keys. A paired phone
can ask agents to act with their existing permissions, so disconnect a lost
device from Chats or remove it from your Tailscale account.

## Developing and checking the mobile client

The mobile React entry is `src/mobile/`. The isolated service is
`desktop/service/mobile.mjs`, with separate Tailscale, transcript and report
adapters. It binds only to loopback. The desktop administrative API manages
pairing; the mobile API exposes selected chat actions and read-only reports.

Run `npm test` for pairing, origin checks, delivery recovery, report boundaries
and route ownership. After `npm run build`, run
`node desktop/service/test/mobile-ui.mjs` for two-client browser checks. These
tests use an isolated transport and stub CLI processes, without touching your
Tailscale setup or starting a model request. A real phone and Tailscale sign-in
are still required to verify the complete remote connection on your network.
