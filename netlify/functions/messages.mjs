import {
  getJSON,
  setJSON,
  json,
  store
} from "./_store.mjs";

import {
  requireUser,
  authError,
  notify
} from "./_auth.mjs";

import crypto from "node:crypto";


/* =========================================================
   CONFIG
   ========================================================= */

const EMPTY_FRIENDS = {
  friends: [],
  incoming: [],
  outgoing: []
};


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function cleanId(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}


function cleanText(value) {
  return String(value || "").trim();
}


/* =========================================================
   PUBLIC USER
   ========================================================= */

async function publicUser(user) {

  if (!user) return null;

  const profile = await getJSON(
    `profile:${user.accountId}`,
    {}
  );

  return {
    accountId: user.accountId || "",
    username: user.username || "",
    name: user.name || "",
    profilePicture:
      profile.profilePicture ||
      user.profilePicture ||
      "",
    accountType:
      user.accountType ||
      "PATIENT",
    role: user.role || ""
  };
}


/* =========================================================
   GET USER
   ========================================================= */

async function getUser(accountId) {

  if (!accountId) return null;

  return getJSON(
    `user:${accountId}`,
    null
  );
}


/* =========================================================
   FRIEND CHECK
   ========================================================= */

async function isFriend(accountA, accountB) {

  if (!accountA || !accountB) {
    return false;
  }

  const a =
    await getJSON(
      `friends:${accountA}`,
      EMPTY_FRIENDS
    );

  const b =
    await getJSON(
      `friends:${accountB}`,
      EMPTY_FRIENDS
    );


  /*
   Normally friends data দুজনের কাছেই থাকে।
   তাই দুই দিকই check করছি।
  */

  return (
    Array.isArray(a.friends) &&
    a.friends.includes(accountB)
  ) || (
    Array.isArray(b.friends) &&
    b.friends.includes(accountA)
  );
}


/* =========================================================
   MESSAGE PERMISSION
   ========================================================= */

async function canMessage(user, other) {

  if (!user || !other) {
    return false;
  }

  /*
   নিজের সাথে message নয়
  */

  if (
    user.accountId ===
    other.accountId
  ) {
    return false;
  }


  /*
   Friend হলে message করা যাবে
  */

  if (
    await isFriend(
      user.accountId,
      other.accountId
    )
  ) {
    return true;
  }


  /*
   Doctor হলে direct message করা যাবে।
   অর্থাৎ Patient -> Doctor
   এবং Doctor -> Doctor
   */

  if (
    user.accountType === "DOCTOR" ||
    other.accountType === "DOCTOR"
  ) {
    return true;
  }


  return false;
}


/* =========================================================
   CONVERSATION KEY
   ========================================================= */

function conversationKey(accountA, accountB) {

  return [
    accountA,
    accountB
  ]
    .sort()
    .join(":");

}


/* =========================================================
   GET ALL USERS
   ========================================================= */

async function getAllUsers() {

  const listed =
    await store().list({
      prefix: "user:"
    });

  const users = [];


  for (const item of listed.blobs || []) {

    const user =
      await getJSON(
        item.key,
        null
      );

    if (!user) continue;

    users.push(user);

  }


  return users;
}


/* =========================================================
   GET MESSAGE CONTACTS
   ========================================================= */

async function getMessageContacts(user) {

  const friends =
    await getJSON(
      `friends:${user.accountId}`,
      EMPTY_FRIENDS
    );


  const ids = new Set();


  /*
   Friends
  */

  for (const id of friends.friends || []) {

    if (id !== user.accountId) {
      ids.add(id);
    }

  }


  /*
   Doctors
  */

  const allUsers =
    await getAllUsers();


  for (const other of allUsers) {

    if (!other) continue;

    if (
      other.accountId ===
      user.accountId
    ) {
      continue;
    }


    if (
      other.accountType ===
      "DOCTOR"
    ) {
      ids.add(
        other.accountId
      );
    }

  }


  const contacts = [];


  /*
   Contact information তৈরি
  */

  for (const accountId of ids) {

    const other =
      await getUser(accountId);

    if (!other) continue;


    const allowed =
      await canMessage(
        user,
        other
      );


    if (!allowed) continue;


    const key =
      conversationKey(
        user.accountId,
        other.accountId
      );


    const messages =
      await getJSON(
        key,
        []
      );


    const lastMessage =
      messages.length
        ? messages[messages.length - 1]
        : null;


    const unreadCount =
      messages.filter(
        message =>
          message.toAccountId ===
            user.accountId &&
          message.read !== true
      ).length;


    contacts.push({

      ...(await publicUser(other)),

      lastMessage:
        lastMessage?.message || "",

      lastMessageAt:
        lastMessage?.createdAt || "",

      unreadCount,

      isFriend:
        await isFriend(
          user.accountId,
          other.accountId
        )

    });

  }


  /*
   Latest conversation first
  */

  contacts.sort(
    (a, b) => {

      const aTime =
        new Date(
          a.lastMessageAt || 0
        ).getTime();

      const bTime =
        new Date(
          b.lastMessageAt || 0
        ).getTime();

      return bTime - aTime;

    }
  );


  /*
   যাদের কোনো message নেই
   তাদের নাম দিয়ে sort
  */

  contacts.sort(
    (a, b) => {

      const aHas =
        Boolean(a.lastMessageAt);

      const bHas =
        Boolean(b.lastMessageAt);


      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;


      if (!aHas && !bHas) {

        return String(
          a.name || a.username
        ).localeCompare(
          String(
            b.name || b.username
          )
        );

      }


      return 0;

    }
  );


  return contacts;
}


/* =========================================================
   MARK MESSAGES AS READ
   ========================================================= */

async function markConversationRead(
  messages,
  currentAccountId
) {

  let changed = false;


  const updated =
    messages.map(message => {

      if (
        message.toAccountId ===
          currentAccountId &&
        message.read !== true
      ) {

        changed = true;

        return {
          ...message,
          read: true
        };

      }

      return message;

    });


  return {
    updated,
    changed
  };
}


/* =========================================================
   GET /api/messages
   ========================================================= */

async function handleGet(
  req,
  user
) {

  const url =
    new URL(req.url);


  const otherId =
    cleanId(
      url.searchParams.get("with")
    );


  /*
   ---------------------------------------------------------
   Contact list
   /api/messages
   ---------------------------------------------------------
  */

  if (!otherId) {

    const contacts =
      await getMessageContacts(
        user
      );


    return json({

      success: true,

      contacts

    });

  }


  /*
   ---------------------------------------------------------
   Specific conversation
   /api/messages?with=ACC-XXXX
   ---------------------------------------------------------
  */

  const other =
    await getUser(
      otherId
    );


  if (!other) {

    return json(
      {
        error:
          "এই user-এর account পাওয়া যায়নি।"
      },
      404
    );

  }


  /*
   Permission check
  */

  const allowed =
    await canMessage(
      user,
      other
    );


  if (!allowed) {

    return json(
      {
        error:
          "শুধু Friend অথবা Doctor-এর সঙ্গে message করা যাবে।"
      },
      403
    );

  }


  const key =
    conversationKey(
      user.accountId,
      other.accountId
    );


  const messages =
    await getJSON(
      key,
      []
    );


  /*
   Unread messages read করে দাও
  */

  const result =
    await markConversationRead(
      messages,
      user.accountId
    );


  if (result.changed) {

    await setJSON(
      key,
      result.updated
    );

  }


  return json({

    success: true,

    other:
      await publicUser(other),

    messages:
      result.updated

  });

}


/* =========================================================
   POST /api/messages
   ========================================================= */

async function handlePost(
  req,
  user
) {

  let body;


  try {

    body =
      await req.json();

  } catch {

    return json(
      {
        error:
          "Invalid request data."
      },
      400
    );

  }


  const action =
    cleanText(
      body.action
    ).toLowerCase();


  /*
   ---------------------------------------------------------
   SEND MESSAGE
   ---------------------------------------------------------
  */

  if (
    action !== "send"
  ) {

    return json(
      {
        error:
          "Invalid message action."
      },
      400
    );

  }


  const receiverId =
    cleanId(
      body.toAccountId
    );


  const messageText =
    cleanText(
      body.message
    );


  /*
   Receiver validation
  */

  if (!receiverId) {

    return json(
      {
        error:
          "Receiver নির্বাচন করুন।"
      },
      400
    );

  }


  /*
   Message validation
  */

  if (!messageText) {

    return json(
      {
        error:
          "Message লিখুন।"
      },
      400
    );

  }


  if (
    messageText.length > 5000
  ) {

    return json(
      {
        error:
          "Message সর্বোচ্চ 5000 characters হতে পারবে।"
      },
      400
    );

  }


  /*
   Cannot message yourself
  */

  if (
    receiverId ===
    user.accountId
  ) {

    return json(
      {
        error:
          "নিজেকে message করা যাবে না।"
      },
      400
    );

  }


  /*
   Receiver
  */

  const receiver =
    await getUser(
      receiverId
    );


  if (!receiver) {

    return json(
      {
        error:
          "Receiver account পাওয়া যায়নি।"
      },
      404
    );

  }


  /*
   Permission
  */

  const allowed =
    await canMessage(
      user,
      receiver
    );


  if (!allowed) {

    return json(
      {
        error:
          "শুধু Friend অথবা Doctor-কে message করা যাবে।"
      },
      403
    );

  }


  /*
   Conversation
  */

  const key =
    conversationKey(
      user.accountId,
      receiver.accountId
    );


  const messages =
    await getJSON(
      key,
      []
    );


  /*
   New message
  */

  const newMessage = {

    id:
      crypto.randomUUID(),

    fromAccountId:
      user.accountId,

    toAccountId:
      receiver.accountId,

    message:
      messageText,

    createdAt:
      new Date().toISOString(),

    read:
      false

  };


  messages.push(
    newMessage
  );


  /*
   Keep last 1000 messages
  */

  const savedMessages =
    messages.slice(-1000);


  await setJSON(
    key,
    savedMessages
  );


  /*
   Notification
  */

  try {

    await notify(
      receiver.accountId,
      {

        type:
          "MESSAGE",

        title:
          "নতুন Message",

        message:
          `${user.name || user.username}: ${messageText.slice(0, 100)}`,

        fromAccountId:
          user.accountId

      }
    );

  } catch (notificationError) {

    /*
     Notification fail করলেও
     message যেন fail না করে।
    */

    console.error(
      "Message notification failed:",
      notificationError
    );

  }


  return json({

    success: true,

    message:
      "Message পাঠানো হয়েছে।",

    data:
      newMessage

  });

}


/* =========================================================
   MAIN HANDLER
   ========================================================= */

export default async function handler(req) {

  /*
   Login check
  */

  const user =
    await requireUser(req);


  if (!user) {

    return authError();

  }


  try {

    /*
     GET
    */

    if (
      req.method ===
      "GET"
    ) {

      return await handleGet(
        req,
        user
      );

    }


    /*
     POST
    */

    if (
      req.method ===
      "POST"
    ) {

      return await handlePost(
        req,
        user
      );

    }


    /*
     Other methods
    */

    return json(
      {
        error:
          "Method Not Allowed"
      },
      405
    );


  } catch (error) {

    console.error(
      "Messages API error:",
      error
    );


    return json(
      {
        error:
          "Message operation failed.",
        detail:
          String(
            error?.message || error
          )
      },
      500
    );

  }

}
