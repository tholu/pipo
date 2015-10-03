function SocketClient() {
  var self = this;
  var host = window.location.host;
  this.socket = window.io(host + '/socket');

  window.username = localStorage.getItem('username');
  window.email = localStorage.getItem('email');
  window.fullName = localStorage.getItem('fullName');

  this.socket.on('connect', function() {
    console.log("Connected to socket.io server");
  });

  this.socket.on('certificate', function(certificate) {
    window.encryptionManager.verifyCertificate(certificate, function(err) {
      self.init();
    });
  });

  this.socket.on('connect_error', function(err) {
    console.log('[SOCKET] (connection error) Disabling chat!', err);
    if (self.listeners) {
      ChatManager.disableChat();
    }
  });
}


SocketClient.prototype.addListeners = function() {
  var self = this;
  self.listeners = true;

  this.socket.on('authenticated', function(data) {
    console.log("[SOCKET] authenticated");
    data.socket = this;

    Authentication.authenticated(data);
  });

  this.socket.on('roomUpdate', function(data) {
    console.log("[SOCKET] roomUpdate");
    self.handleRoomUpdate(data);
  });

  this.socket.on('joinComplete', function(data) {
    console.log("[SOCKET] joinComplete");
    self.joinComplete(data);
  });

  this.socket.on('partComplete', function(data) {
    console.log("[SOCKET] partComplete");
    self.partComplete(data);
  });

  this.socket.on('createRoomComplete', function(data) {
    console.log('[SOCKET] createRoomComplete');
    self.createRoomComplete(data);
  });

  this.socket.on('updateRoomComplete', function(data) {
    self.updateRoomComplete(data);
  });

  this.socket.on('chatUpdate', function(data) {
    ChatManager.handleChatUpdate(data);
  });

  this.socket.on('serverCommandComplete', function(data) {
    console.log("[SOCKET] serverCommandComplete");
    self.serverCommandComplete(data);
  });

  this.socket.on('errorMessage', function(data) {
    console.log('errorMessage', data);
  });

  this.socket.on('user connect', function(data) {
    //console.log('user connect', data);
  });

  this.socket.on('membershipUpdateComplete', function(data) {
    self.handleMembershipUpdateComplete(data);
  });

  this.socket.on('roomMessage', function(data) {
    var message = data.message;
    window.encryptionManager.decryptMessage(data.message, function(err, messageString) {
      if (err) {
        console.log(err);
      }
      ChatManager.handleMessage({ messageString: messageString.toString(), date: message.date, fromUserId: data.fromUserId, chatId: data.chatId });
    });
  });

  this.socket.on('privateMessage', function(data) {
    var self = this;
    var message = data.message;

    console.log('privateMessage', data);
    window.encryptionManager.decryptMessage(message, function(err, messageString) {
      if (err) {
        console.log(err);
      }

      data.messageString = messageString;
      data.socket = self;

      ChatManager.handlePrivateMessage(data);
    });
  });

  this.socket.on('newMasterKey', function(data) {
    console.log("[SOCKET] 'new master key'");
    var room = data.room;
    ChatManager.disableChat();
    self.joinRoom(room, function(err) {
      ChatManager.localMsg({ type: null, message: "Master key being updated. Please wait..." });
    });
  });

  this.socket.on('userlistUpdate', function(data) {
    var userlist = data.userlist;
    var userNameMap = data.userNameMap;

    console.log("[SOCKET] 'userlistUpdate'");

    ChatManager.userNameMap = userNameMap;

    ChatManager.updateUserlist(userlist);
  });

  this.socket.on('activeUsersUpdate', function(data) {
    var uniqueRoomUsersArray = [];
    var newRoomUsersArray = [];
    var chatId = data.chatId;
    var chatName = ChatManager.chats[chatId].name;
    var activeUsers = data.activeUsers;

    console.log("[SOCKET] 'roomUsersUpdate' for room #" + chatName);

    if (ChatManager.chats[chatId]) {
      ChatManager.chats[chatId].activeUsers = activeUsers;
    }

    /*
    // BUG: Should update the users in the ChatManager.chats[chatId] object instead of window.roomUsers
    if (window.roomUsers[chatId]) {
      var currentRoomUsersArray = Object.keys(window.roomUsers[chatId]);

      Object.keys(roomUsers).forEach(function(key) {
        console.log("Found new user '" + roomUsers[key].username);
        newRoomUsersArray.push(roomUsers[key].username);
      });

      uniqueRoomUsersArray = newRoomUsersArray.filter(function(user) {
        return !currentRoomUsersArray.indexOf(user);
      });

      //Don't notify us about ourselves
      // Also should not notify when initially getting the room users update
      uniqueRoomUsersArray.forEach(function(joinusername) {
        if (window.username !== joinusername) {
          if (currentRoomUsersArray.indexOf(joinusername)) {
            console.log("User " + joinusername + " has joined #" + chatName);
            clientNotification.send(null, 'PiPo', joinusername + ' has joined #' + chatName, 3000);
          } else {
            console.log("User " + joinusername + " has left #" + chatName);
            clientNotification.send(null, 'PiPo', joinusername + ' has left #' + chatName, 3000);
          }
        }
      })
    }

    window.roomUsers[chatId] = {};

    roomUsers.forEach(function(user) {
      if (user) {
        addToRoomUsers(user);
        if (window.userMap[user.userId]) {
          if (window.userMap[user.userId].publicKey === user.publicKey) {
            return;
          }
        }
        addToGlobalUsers(user);
      }
    });

    function addToRoomUsers(user) {
      if (!window.roomUsers[chatId][user.userId]) {
        window.roomUsers[chatId][user.userId] = {
          connections: 1
        };
      }
      else {
        window.roomUsers[chatId][user.userId].connections++;
      }
    }
    function addToGlobalUsers(user) {
      window.userMap[user.userId] = {
        publicKey: user.publicKey
      };

      //Don't build publicKey for ourselves
      if (user.username != window.username) {
        //Build pgp key instance
        //console.log("[USERLIST UPDATE] user.publicKey: "+user.publicKey);
        window.kbpgp.KeyManager.import_from_armored_pgp({
          armored: user.publicKey
        }, function (err, keyInstance) {
          if (err) {
            console.log("Error importing user key", err);
          }
          console.log("imported key", user.username);
          window.userMap[user.userId].keyInstance = keyInstance;
          // Setting key instance here but we need to do this elsewhere...
          ChatManager.userlist[user.userId].keyInstance = keyInstance;
          encryptionManager.keyRing.add_key_manager(keyInstance);
        });
      }
    }

    console.log("[USERLIST UPDATE] Updating userlist");

    //
    // Need to hash out using active to update the room users list
    // Should probably do this in roomUpdate or chatUpdate instead
    // Break this up into roomUpdate, chatUpdate and key add/remove methods
    //
    */

    if (ChatManager.activeChat && ChatManager.activeChat.id == chatId) {
      ChatManager.updateRoomUsers({ chatId: chatId, socket: self.socket });
    }
  });

  this.socket.on('chatStatus', function(data) {
    console.log("Got chat status...");
    var statusType = data.statusType;
    var statusMessage = data.statusMessage;
    ChatManager.localMsg({ type: statusType, message: statusMessage });
    var $messages = $('#messages');
    $messages[0].scrollTop = $messages[0].scrollHeight;
  });

};

SocketClient.prototype.init = function() {
  var self = this;
  console.log("[INIT] Loading client keypair...");
  ChatManager.init();
  window.encryptionManager.loadClientKeyPair(function (err, loaded) {
    if (err) {
      //Show error somewhere
      return console.log("[INIT] Error loading client key pair: "+err);
    }
    if (!loaded) {
      console.log("[INIT] Prompting for credentials");
      return ChatManager.initialPromptForCredentials();
    } else {
      console.log("[INIT] Client credentials loaded");
    }
    if (!self.listeners) {
      self.addListeners();
    }
    console.log("[INIT] Authenticating");
    return Authentication.authenticate({ socket: self.socket });
  });
};



SocketClient.prototype.joinRoom = function(roomId, callback) {
  var self = this;
  if (roomId && typeof roomId !== 'undefined') {
    console.log("[JOIN ROOM] Joining room #"+roomId+" as "+window.username);
    self.socket.emit('join', { roomId: roomId } );
    return callback(null);
  } else {
    return console.log("[JOIN ROOM] roomId was null  !");
  }
};

SocketClient.prototype.createRoom = function(data, callback) {
  var self = this;
  console.log("[CREATE ROOM] Creating room");
  var data = {
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  };
  self.socket.emit('createRoom', data);
  callback(null);
};

SocketClient.prototype.updateRoom = function(data, callback) {
  var self = this;
  console.log("[UPDATE ROOM] Updating room");
  var data = {
    id: data.id,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  };
  console.log("[UPDATE ROOM] Updating with data:",data);
  self.socket.emit('updateRoom', data);
  callback(null);
};

SocketClient.prototype.partRoom = function(data, callback) {
  var self = this;
  var chatId = data.chatId;
  console.log("[PART ROOM] Parting room #" + ChatManager.chats[chatId].name);
  self.socket.emit('part', { chatId: chatId } );
  callback(null);
};

SocketClient.prototype.sendMessage = function(data) {
  var self = this;
  var chatId = data.chatId;
  var message = data.message;

  console.log("Encrypting message: " + message);
  window.encryptionManager.encryptRoomMessage({ chatId: chatId, message: message }, function(err, pgpMessage) {
    if (err) {
      console.log("Error Encrypting Message: " + err);
    }
    else {
      console.log("[socketClient.sendMessage] Sending encrypted message to chat ID: ", chatId);
      self.socket.emit('roomMessage', {chatId: chatId, pgpMessage: pgpMessage});
      $('#message-input').val('');
    }
  });
};

SocketClient.prototype.joinComplete = function(data) {
  var self = this;
  var err = data.err;
  var room = data.room;

  if (err) {
    console.log("Cannot join channel due to permissions");

    //if (ChatManager.lastActiveChat) {
    //  ChatManager.activeChat = ChatManager.lastActiveChat;
    //}

    return ChatManager.showError(err);
  }

  console.log("[SOCKET] (joinComplete) room: "+room.name+" data.encryptionScheme: "+data.encryptionScheme);

  window.encryptionManager.encryptionScheme[room.name] = data.encryptionScheme;

  console.log("[SOCKET] (joinComplete) encryptionScheme: "+data.encryptionScheme);

  if (data.encryptionScheme == 'masterKey') {
    var masterKeyPair = data.masterKeyPair;

    console.log("[SOCKET] (joinComplete) Loading master key pair...");

    // TODO: Need to make sure clientKeyManager is decrypted here
    window.encryptionManager.loadMasterKeyPair(room.name, masterKeyPair, function(err, loaded) {
      if (err) { return console.log("[INIT] ERROR loading master key pair") };

      if (!loaded) { return console.log("[JOIN COMPLETE] masterKeyPair not loaded...") };

      console.log("[INIT] Done decrypting master and client credentials - ENABLEING CHAT");
    });
  } else {
    console.log("[INIT] Enabling chat in clientKey mode");
  }

  ChatManager.initRoom(room, function(err) {
    ChatManager.chats[room.id].joined = true;
    ChatManager.updateRoomList(function() {
      ChatManager.enableChat(room, data.encryptionScheme);
    });
  });
};

SocketClient.prototype.partComplete = function(data) {
  var self = this;
  var room = data.room;
  ChatManager.destroyChat(room, function() {
    console.log("Done parting room");
  });
};

SocketClient.prototype.createRoomComplete = function(data) {
  var self = this;
  var room = data.room;
  self.joinRoom(room.id, function(err) {
    if (err) {
      return console.log("Error joining room after creating: " + err);
    }
    console.log("Joined room...");
  })
};

SocketClient.prototype.updateRoomComplete = function(data) {
  var self = this;
  var name = data.name;
  console.log("[UPDATE ROOM COMPLETE] Done updating room...");
};

/*
 * Get all rooms that user is a member of or is public
 */
SocketClient.prototype.handleRoomUpdate = function(data) {
  var self = this;
  var rooms = data.rooms;
  var activeChatId = null;
  var activeChatName = null;

  if (data.err) {
    return console.log("[socketClient.handleRoomUpdate] Room update failed: ",data.err);
  };

  // We want to update one at a time in case we only receive an update for select room(s)
  Object.keys(rooms).forEach(function(id) {
    console.log("[socketClient.handleRoomUpdate] Adding room",id,"to array with data:",rooms[id]);
    ChatManager.chats[id] = rooms[id];
  })

  if (ChatManager.activeChat) {
    activeChatId = ChatManager.activeChat.id;
    activeChatName = ChatManager.chats[activeChatId].name;
    console.log("[socketClient.handleRoomUpdate] Refreshing active chat '" + activeChatName + "'");
    ChatManager.refreshChatContent(activeChatId);

    // if manageMembersModal is currently visible don't clear any error or ok messages
    ChatManager.populateManageMembersModal({ clearMessages: false });
  }

  ChatManager.buildRoomListModal;
};

SocketClient.prototype.handleMembershipUpdateComplete = function(data) {
  var success = data.success;
  var message = data.message;

  if (!success) {
    // display error on membership editor modal
    ChatManager.membershipUpdateError(data.message);
    return console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Failed to add member: ", message);
  }

   // Show OK on membership editor modal
  console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Member added! Displaying message in modal. Message:", message);

  // This doesn't actually do anything becuase the room update has not been received by roomUpdate yet
  console.log("[socketClient.handleMembershipUpdateComplete] Running populateManageMembersModal");
  ChatManager.populateManageMembersModal({ clearMessages: false });
  ChatManager.membershipUpdateMessage(message);
};

SocketClient.prototype.sendServerCommand = function(data) {
  var self = this;
  var command = data.command;
  var currentChat = data.currentChat;
  self.socket.emit('serverCommand', { command: command, currentChat: currentChat });
};

SocketClient.prototype.serverCommandComplete = function(data) {
  var self = this;
  var response = data.response;
  console.log("Displaying response from server command in chat '" + ChatManager.activeChat.name + "'");
  ChatManager.addMessageToChat({ type: ChatManager.activeChat.type, message: response, chat: ChatManager.activeChat.name });
};

SocketClient.prototype.membership = function(data) {
  var self = this;

  console.log("[MEMBERSHIP] Emitting membership");
  self.socket.emit('membership', data);
};

SocketClient.prototype.sendPrivateMessage = function(data) {
  var self = this;
  var ids = data.ids;
  var message = data.message;

  ChatManager.prepareMessage(message, function(err, preparedMessage) {
    window.encryptionManager.encryptPrivateMessage(ids, preparedMessage, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }

      else {
        // Only leaving toUsername until I migrate the server side to tracking users by id instead of name
        self.socket.emit('privateMessage', {toUserIds: ids, pgpMessage: pgpMessage });
        $('#message-input').val('');
      }
    });
  });
};

SocketClient.prototype.updateMasterKey = function updateMasterKey(callback) {
  window.encryptionManager.getMasterKeyPair(username, function(err, encryptedMasterKeyPair) {
    if (err) {
      console.log("Error getting master key pair: "+err);
      ChatManager.localMsg({ type: "ERROR", message: "Error getting master key pair" });
      return callback("Error getting master key pair");
    } else {
      pleaseWait();
      ChatManager.localMsg({ type: null, message: "Updated master key pair" });
      console.log("Got master keypair, ready to encrypt/decrypt");
      encryptedMasterKeyPair.publicKey = encMasterKeyPair.publicKey;
      encryptedMasterKeyPair.privateKey = encMasterKeyPair.privateKey;
      console.log("Ensuring that client keypair exists");
      //console.log("keyPair.privateKey at new master key is: "+keyPair.privateKey);
      if (typeof keyPair.privateKey !== 'undefined' && keyPair.privateKey !== null) {
        console.log("[new master key] Client KeyPair exists. Trying to decrypt master key for '"+username+"'...");
        console.log("encryptedMasterKeyPair.privateKey: "+encryptedMasterKeyPair.privateKey);
        console.log("encryptedMasterKeyPair.publicKey: "+encryptedMasterKeyPair.publicKey);
        decryptMasterKey(username, keyPair.privateKey, encryptedMasterKeyPair.privateKey, function(err, key) {
          console.log("(new master key) Caching master private key decrypted");
          masterKeyPair.privateKey = key;
          masterKeyPair.publicKey = encMasterKeyPair.publicKey;
          return callback(null);
        });
      } else {
        console.log("Private key does not yet exist so cannot decrypt master key");
        return callback("Private key does not exist");
      };
    };
  });
};

Array.prototype.contains = function(v) {
  for(var i = 0; i < this.length; i++) {
    if(this[i] === v) return true;
  }
  return false;
};

Array.prototype.unique = function() {
  var arr = [];
  for(var i = 0; i < this.length; i++) {
    if(!arr.contains(this[i])) {
      arr.push(this[i]);
    }
  }
  return arr;
}

window.socketClient = new SocketClient();
