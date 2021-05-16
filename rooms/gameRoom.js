// colyseus librarys
const colyseus = require('colyseus');
const schema = require('@colyseus/schema');
const Schema = schema.Schema;
const MapSchema = schema.MapSchema;
const ArraySchema = schema.ArraySchema;

//redis connection
const redis = require("redis");
const cledis = redis.createClient();
cledis.on("error", function(error) {
  console.error(error);
});

const OneSignal = require('onesignal-node');
const OsClient = new OneSignal.Client('b480a1b1-1d29-4ec8-89fe-a83e881ced94', 'ODBiN2NhYzAtYjhiZS00NzM5LTkzZDUtMDRlMDc0YzUzZmZk');

const SpellChecker = require('simple-spellchecker');
    

// var dictionary = SpellChecker.getDictionarySync("fr-FR");


// Game classes

const Bag = require('./bag.js');
// const Bag = require('./bag-wild.js');




class Message extends Schema {
  constructor(userid, name, text) {
    super();
    this.userid = userid;
    this.name = name;
    this.text = text;
  }
}

schema.defineTypes(Message, {
  text: "string",
  userid: "string",
  name: "string"
});




class Turn extends Schema {
  constructor(userid, name, letters, score) {
    super();
    this.userid = userid;
    this.name = name;
    this.letters = letters;
    this.score = score;
  }
}

schema.defineTypes(Turn, {
  userid: "string",
  name: "string",
  letters: "string",
  score: "number"
});




class Letter extends Schema {
  constructor(char, points) {
    super();
    this.char = char;
    this.points = points;
  }
}

schema.defineTypes(Letter, {
  char: "string",
  points: "number"
});



class Player extends Schema {
  constructor(userid, name, active) {
    super();
    this.userid = userid;
    this.points = 0;
    this.name = name;
    this.active = (active===true);
    this.rack = new ArraySchema();
  }
  
  getRack(){
    var chars = [];
    this.rack.forEach(function(letter, key){
      console.log("rack letter", letter.char);
      chars.push(letter.char);
    });
    return chars;
  }
}

schema.defineTypes(Player, {
  userid: "string",
  points: "number",
  name: "string",
  active: "boolean",
  rack: [ Letter ]

});



class Square extends Schema {
  constructor(u, v, char, points) {
    super();
    this.u = u;
    this.v = v;
    this.char = char;
    this.points = points;
  }
}

schema.defineTypes(Square, {
  u: "number",
  v: "number",
  char: "string",
  points: "number"
  // state: "string"
});



class SpecialSquare extends Schema {
  constructor(u, v, type) {
    super();
    this.u = u;
    this.v = v;
    this.type = type;
  }
}

schema.defineTypes(SpecialSquare, {
  u: "number",
  v: "number",
  type: "string",
});




class Prefs extends Schema {
  constructor() {
    super();
    this.num_l2 = 2;
    this.num_l3 = 2;
    this.num_w2 = 2;
    this.num_w3 = 2;
  }
}

schema.defineTypes(Prefs, {
  num_l2: "number",
  num_l3: "number",
  num_w2: "number",
  num_w3: "number",
});









// STATE CLASS
class MyState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.squares = new MapSchema();
    this.special_squares = new ArraySchema();
    this.chat = new ArraySchema();
    this.history = new ArraySchema();
    this.last_played = new ArraySchema();
    this.turn = '';
    this.prefs = new Prefs();
    this.debug = '';
  }

  createPlayer(sessionid, userid, name, active) {
    if(this.players.get(sessionid)){  //delete it if it already exists
      console.log("deleting existing user from state", sessionid);
      this.players.delete(sessionid);
    }
    
    this.players.set(sessionid, new Player(userid, name, (active===true)));
   
    // if this is the first player, set the turn to the player id
    if(this.players.size==1 &&  this.turn==''){
      this.turn = userid;
    }
  }
  
  removePlayer(sessionid) {
    this.players.delete(sessionid);
  }
  
  /*find a player using the userid instead of the sessionid*/
  getPlayerByUserID(userid){
    for (const [key, player] of this.players) {
      console.log("searching player:", player.userid);
      if(player.userid == userid){
        return {sessionId: key, player:player};
      }
    }
    return false;
  }
  
  getAllUserIDs(){
    var ids = [];
    for (const [key, player] of this.players) {
      ids.push(player.userid);
    }
    return ids;
  }  
  
  getAllInactiveUserIDs(){
    var ids = [];
    for (const [key, player] of this.players) {
      if(player.active == false){
        ids.push(player.userid);
      }
    }
    return ids;
  }
  
  getAllActiveUserIDs(){
    var ids = [];
    for (const [key, player] of this.players) {
      if(player.active == false){
        ids.push(player.userid);
      }
    }
    return ids;
  }
  
  setSquare(u, v, char, points) {
    var key = u+"_"+v;
    this.squares.set(key, new Square(u, v, char, points));
  }
  clearSquare(u, v) {
    var key = u+"_"+v;
    this.squares.delete(key);
  }
  
}

schema.defineTypes(MyState, {
  players: { map: Player },
  squares: { map: Square },
  special_squares: [SpecialSquare],
  chat: [Message],
  history: [Turn],
  last_played: [Square],
  turn: "string",
  prefs: Prefs,
  debug: "string"
});


// ****** GLOBAL CONSTANTS
const gridsize = 15;
const racksize = 7;
const alphabet = "abcdefghijklmnopqrstuvwxyz";

var bag;  //room global for holding letters

var gameid = false;

exports.myGameRoom = class extends colyseus.Room {
    // When room is initialized
    onCreate (options) { 
        console.log("creating StarterRoom", options);
        
        this.dictionary;// define it
        this.loadDictionary(this, "clabbers");
        
        this.gameid = options.gameid;
        this.setState(new MyState());
        
        // create the random special squares based on the state prefs
        this.state.special_squares = new ArraySchema(); //clear it
        this.generateSpecialSquares('l2', this.state.prefs.num_l2);
        this.generateSpecialSquares('l3', this.state.prefs.num_l3);
        this.generateSpecialSquares('w2', this.state.prefs.num_w2);
        this.generateSpecialSquares('w3', this.state.prefs.num_w3);
        
        
        // create default bag for this room
        this.bag = new Bag();
        this.bag.shuffle();
        
        // get saved state if it exists
        var room = this;
        var successfullReload = false;
        var key = "game_state:"+this.gameid;
        console.log('LOADING game state', key);
        cledis.hmget(key, "squares", "bag", "turn", "chat", "last_played", "history", "prefs", "special_squares",
          function(err, res) {
            console.log("game state LOADED", res, err);
            // console.log("first item:", res[0])
            // console.log("second item:", res[1])
            // console.log("third item:", res[2])
            
            if(res){
              try{
                
                //load squares
                if(res[0]){
                  var squares = JSON.parse(res[0]);
                  console.log("parsed SQUARES obj",  squares)
                  for (var key in squares){
                    console.log( 'realoding letter: ', key, squares[key] );
                    room.state.setSquare(squares[key].u, squares[key].v, squares[key].char, squares[key].points);
                  }
                }
                
                //load bag
                if(res[1]){
                  var bag = JSON.parse(res[1]);
                  console.log("parsed BAG obj", typeof bag.letters)
                  if(typeof bag.letters == 'object'){
                    room.bag.letters = [];  //clear it before loading
                    bag.letters.forEach(function(loaded_letter, i){
                      var letter = new Letter(loaded_letter.char, loaded_letter.points);
                      room.bag.letters.push(letter);
                    })
                    console.log("RELOADED BAG: ", room.bag.letters.length);
                  }else{
                    console.log("BAG.letters is not an object", typeof bag.letters)
                  }
                }
                
                
                //load turn
                if(res[2]){
                  room.state.turn = res[2];
                }
                
                //load chat
                if(res[3]){
                  var chats = JSON.parse(res[3]);
                  console.log("parsed CHATS obj",  chats)
                  var newChats = new ArraySchema();
                  
                  for (var key in chats){
                    console.log( 'reloading chats: ', chats[key] );
                    var message = new Message(chats[key].userid, chats[key].name, chats[key].text);
                    newChats.push(message);
                  }
                  room.state.chat = newChats;
                }
                
                
                //load last_played
                if(res[4]){
                  var squares = JSON.parse(res[4]);
                  console.log("parsed lastPlayed obj",  squares)
                  room.state.last_played = new ArraySchema();
                  
                  for (var key in squares){
                    console.log( 'reloading last_played letters: ', squares[key] );
                    room.state.last_played.push( new Square(squares[key].u, squares[key].v, squares[key].char, squares[key].points) );
                  }
                }
                
                
                //load history
                if(res[5]){
                  var history = JSON.parse(res[5]);
                  console.log("parsed HISTROY obj",  history)
                  var newHistory = new ArraySchema();
                  
                  for (var key in history){
                    console.log( 'reloading history: ', history[key] );
                    var turn = new Turn(history[key].userid, history[key].name, history[key].letters, history[key].score);
                    newHistory.push(turn);
                  }
                  room.state.history = newHistory;
                }
                
                
                
                //load prefs
                if(res[6]){
                  var prefs = JSON.parse(res[6]);
                  console.log("parsed PREFS obj",  prefs)
                  var newPrefs = new Prefs();
                  
                  for (var key in prefs){
                    console.log( 'reloading prefs: ', key, prefs[key] );
                    newPrefs[key] = prefs[key];
                  }
                  room.state.prefs = newPrefs;
                }
                
                
                //load special_squares
                if(res[7]){
                  var special_squares = JSON.parse(res[7]);
                  console.log("parsed special_squares obj",  special_squares)
                  var newSpecialSquares = new ArraySchema();
                  
                  for (var key in special_squares){
                    console.log( 'reloading special_squares: ', special_squares[key] );
                    var square = new SpecialSquare(special_squares[key].u, special_squares[key].v, special_squares[key].type);
                    newSpecialSquares.push(square);
                  }
                  room.state.special_squares = newSpecialSquares;
                }
                
                
                
                // done
                successfullReload = true;
                console.log("successfully LOADED state from DB")
              }catch(e){
                console.log("problem loading saved state, so starting fresh", e)
                successfullReload = false;
              }
            }
          }
        );
        
        
        var key = "game_players:"+room.gameid;
        console.log('LOADING game PLAYERS', key);
        cledis.smembers(key,
          function(err, res) {
            console.log("PLAYERS FOUND", res, err);
            if(res){
              for (const userid of res) {
                console.log("checking for existing player by userid", userid);
                //if there's NO player in the state already by that userid, then get the stored details and create it
                if(! room.state.getPlayerByUserID(userid)){
                  console.log("no current user by that userid in the state, so checking for saved data");
                  var key = "game_player_state:"+room.gameid + ":" + userid;
                  console.log('LOADING game PLAYER STATE', key);
                  cledis.get(key,
                    function(err, playerstate) {
                      console.log("GOT player state", playerstate);
                      const savedPlayer = JSON.parse(playerstate);
                      if(savedPlayer){
                        const tempID = "tmp_"+room.randomGameID();
                        
                        console.log("RECREATING OLD PLAYER: ", tempID, savedPlayer, room.state)
                        room.state.createPlayer(tempID, savedPlayer.userid,  savedPlayer.name);
                        room.state.players[tempID].points = savedPlayer.points;
                      }
                    }
                  );
                }
              }
            }
          }
        );
        
        
        
        //if it DIDN'T Load the state from backup, then create a fresh one
        // if(successfullReload==false){
          // console.log("room bag:", this.bag);
        // }

        
        this.onMessage("test", (client, message) => {
          console.log("got message of type, 'TEST'");
          // var ids = this.state.getAllUserIDs();
          // this.sendNotification(ids, "Hello World", "This is a test message");
          
          // try to generate some random special-squares
          this.state.special_squares = new ArraySchema(); //clear it
          
          this.generateSpecialSquares('l2', 2);
          this.generateSpecialSquares('l3', 2);
          this.generateSpecialSquares('w2', 2);
          this.generateSpecialSquares('w3', 2);
          
          
        });
        
        
        
        this.onMessage("play_word", (client, message) => {
          console.log("got message of type, 'play_word'");
          this.playWord(client.sessionId, message);
        });
        
        
        this.onMessage("get_bag", (client, message) => {
          console.log("got message of type, 'get_bag'");
          this.broadcast("bag_letters", this.bag.letter);
        });
        
        
        this.onMessage("update_name", (client, message) => {
          console.log("got message of type, 'update_name'", message.name);
          if(message.name != ""){
            var newName = message.name.replace(/[^\w\s]/gi, '');
            this.state.players[client.sessionId].name = newName;
          }
        });
        
        
        this.onMessage("check_spelling", (client, message) => {
          console.log("got message of type, 'check_spelling'", message.word);
          if(message.word != ""){
            var result;
            if(message.suggestions == true){
              result = this.dictionary.checkAndSuggest(message.word);
            }else{
              result = this.dictionary.spellCheck(message.word);
            }
            client.send("spellcheck_result", {
              action: message.action, 
              result: result,
              message : message
            });
          }
        });
        
        
        
        this.onMessage("reset_game", (client, message) => {
          console.log("got message of type, 'reset_game', so resetting!");
          
          // create the random special squares based on the state prefs
          this.state.special_squares = new ArraySchema(); //clear it
          this.generateSpecialSquares('l2', this.state.prefs.num_l2);
          this.generateSpecialSquares('l3', this.state.prefs.num_l3);
          this.generateSpecialSquares('w2', this.state.prefs.num_w2);
          this.generateSpecialSquares('w3', this.state.prefs.num_w3);
          
          this.bag = new Bag();
          this.bag.shuffle();
          console.log("RESET room bag:", this.bag);
          this.broadcast("bag_letters", this.bag.letters);
          
          var room = this;
          room.state.players.forEach(function(player, key){
            console.log("resetting each player:", key);
            room.state.players[key].rack = new ArraySchema();
            room.loadPlayerRack(key);
            room.state.squares = new MapSchema();
            room.state.players[key].points = 0;
            
            console.log("new reset PLAYER rack of letters:");
            room.state.debug = JSON.stringify( room.state.players[key].getRack());

            console.log("saving reset player state for id", key)
            room.savePlayerState(key);
          });
          this.state.history = new ArraySchema();
          this.state.turn = this.state.players[client.sessionId].userid;
          console.log("set turn to", this.state.turn)
        
        });
        
        
        
        
        this.onMessage("chat_entry", (client, message) => {
          console.log("got message of type, 'chat_entry'", message);
          var data = new Message(
            this.state.players[client.sessionId].userid, 
            this.state.players[client.sessionId].name, 
            message
          );
          
          this.state.chat.push(data); //add it to the list of chats
          
          if(this.state.chat.length > 20){ //limit the length of this chat array...
            this.state.chat.shift();
          }
          
          console.log("new current chat list:", this.state.chat);
          
          var ids = this.state.getAllInactiveUserIDs();
          var myId = this.state.players[client.sessionId].userid
          var filtered_ids = ids.filter(function(value, index, arr){ 
              return value != myId;
          });
          this.sendNotification(filtered_ids, this.state.players[client.sessionId].name + " says: ", message);
        
        });
        
        
        
        
        this.onMessage("remove_player_from_game", (client, message) => {
          console.log("got message of type, 'remove_player_from_game'", message);
          if(message != ''){
            //try to remove player from game, first from current state, then from redis history
            var player = this.state.getPlayerByUserID(message);
            if(player){ //if they're currently in the state
              this.state.removePlayer(player.sessionId);
              if(this.clients[player.sessionId]){
                this.clients[player.sessionId].leave(); //disconnect that player
              }
            }       
            
            // then delete it from redis
            var key = "game_players:"+this.gameid;
            cledis.srem(key, message, function(err, res) {
              console.log("game_player removed", key, res);
            });
            
            var key2 = "game_player_state:" + this.gameid + ":" + message;
            cledis.del(key, function(err, res) {
              console.log("player state deleted", key2, res);
            });
          }
        
        });
        
        
        
        this.onMessage("is_active", (client, message) => {
          console.log("got message of type, 'is_active'", message);
          this.state.players[client.sessionId].active = (message.state == true);
        });
        
        
        
        
        
      // ******* end of onCreate message listener functions
    }
    
    // When client successfully join the room
    onJoin (client, options, auth) { 
      console.log("client joined this game:", this.gameid, client.sessionId, options.userid);
      
      console.log("checking for existing player by userid", options.userid);
      //if there's already a player in the state with that userid, toast it, and either reload or start fresh
      var existingPlayer = this.state.getPlayerByUserID(options.userid);
      if(existingPlayer){
        console.log("found a current user by that userid in the state, so replacing it with the new sessionID one");
        
        
        console.log("DUPLICATING EXISTING PLAYER first: ")
        console.log(existingPlayer)
          this.state.createPlayer(client.sessionId, existingPlayer.player.userid,  existingPlayer.player.name);
          this.state.players[client.sessionId].points = existingPlayer.player.points;
          this.state.players[client.sessionId].active = existingPlayer.player.active;
          
          //load the saved rack letters
          var newRack = new ArraySchema();
          
          existingPlayer.player.rack.forEach(function(value, index){
            console.log("adding letter", value);
            var letter = new Letter(value.char, value.points);
            newRack.push(letter);
          });
          this.state.players[client.sessionId].rack = newRack;
          
        // this.state.players.set(client.sessionId, existingPlayer.player);
        console.log("toasting existing one...", existingPlayer.sessionId);
        
        this.state.players.delete(existingPlayer.sessionId);
      }
      else{
        //add the player to the 'state'
        this.state.createPlayer(client.sessionId, options.userid,  options.name, true);  
      }
      
      
      // then save it to redis
      var key = "game_players:"+this.gameid;
      cledis.sadd(key, options.userid, function(err, res) {
        console.log("game_player set", res);
      });
      
      var room = this;  //set for post-redis functions
      
      
      //if the player already exists with a rack, etc, then load them first
      var player = this.state.players[client.sessionId];
      
      key = "game_player_state:" + this.gameid + ":" + player.userid;
      cledis.get(key, function(err, res) {
        console.log("existing player state?", res);
        if(res){
          var loadedPlayer = JSON.parse(res);
          if(loadedPlayer){
            //assign loaded data to live state player
            console.log("loaded player data", loadedPlayer);
            player.name = loadedPlayer.name;
            player.points = loadedPlayer.points;
            
            //load the saved rack letters
            var newRack = new ArraySchema();
            
            loadedPlayer.rack.forEach(function(value, index){
              console.log("adding letter", value);
              var letter = new Letter(value.char, value.points);
              newRack.push(letter);
            }); 
            
            player.rack = newRack;
            
            console.log("loaded player from DB", player);
          }
          
          room.broadcast("bag_letters", room.bag.letters);
        }
        else{
          //get a first set of letters for the player
          room.loadPlayerRack(client.sessionId);
          room.savePlayerState(client.sessionId);
        }
      });
      
      // add this roomid to the list of games this player has been a part of...
      key = "player_games:" + player.userid;
      cledis.sadd(key, this.gameid, function(err, res) {
        console.log("player_games saved?", key, this.gameid, err);
      });
      
      // TEST:
      // console.log("FUNCTION TEST:");
      // this.sendNotification([options.userid], "Hello World", "This is a test message");
      
      
    }

    // When a client leaves the room
    onLeave (client, consented) { 
      console.log("client left", client);
      
      var player_summary = [];
      this.state.players.forEach(function(p, i){
        player_summary.push({name: p.name, points: p.points});
      });
      
      var key = "game_state:"+this.gameid;
      console.log('storing game state', key);
      cledis.hmset(key, 
        "squares", JSON.stringify(this.state.squares),
        "bag", JSON.stringify(this.bag),
        "turn", this.state.turn,
        "chat", JSON.stringify(this.state.chat),
        "history", JSON.stringify(this.state.history),
        "last_played", JSON.stringify(this.state.last_played),
        "last_active_at", Date.now(),
        "players", JSON.stringify(player_summary),
        "prefs", JSON.stringify(this.state.prefs),
        "special_squares", JSON.stringify(this.state.special_squares),
        function(err, res) {
          console.log("game state saved", res, err);
        }
      );
      
      //save the player state who's leaving
      this.savePlayerState(client.sessionId);
      
      // this.state.removePlayer(client.sessionId);  //delete the player from the 'state'
      this.state.players[client.sessionId].active = false;
    }

    // Cleanup callback, called after there are no more clients in the room. (see `autoDispose`)
    onDispose () { 
      console.log("room disposed");
    }
    
    
    // GAME FUNCTIONS
    
    loadDictionary(room, dict){
      console.log("trying to get dictionary", dict)
      SpellChecker.getDictionary(dict, "dict", function(err, result) {
          console.log("loading dictionary, error?", err);
          room.dictionary = result;
          console.log('checking word: ', room.dictionary.checkAndSuggest("tast"))
      });
    }
    
    savePlayerState(sessionId){
      // then save it to redis
      var player = this.state.players[sessionId];
      var key = "game_player_state:" + this.gameid + ":" + player.userid;
      console.log('storing player state', key, player);
      cledis.set(key, JSON.stringify(player), function(err, res) {
        console.log("player state saved", res);
      });
    }
    
    // load up a player's rack of letters
    loadPlayerRack(id) {
      console.log("loading player's rack with letters", id);
      var rack = this.state.players[id].rack;
      var letters_needed = racksize - rack.length;
      console.log("letters needed in rack? ", letters_needed);
      
      for(var i=0; i < Math.min(letters_needed, this.bag.letters.length); i++){
        var pulled_letter = this.bag.letters.shift();
        var letter = new Letter(pulled_letter.char, pulled_letter.points);
        console.log("adding letter: ", letter.char)
        this.state.players[id].rack.push(letter);
      }
      console.log("new player rack:")
      this.state.players[id].getRack();
      
      // this.broadcast("update_rack")
      
      this.broadcast("bag_letters", this.bag.letters);
    }
    
    removeFromRack(room, sessionId, letter){
      // find the index of the item you'd like to remove
      var letter_to_remove = (letter.wild==true) ? "_" : letter.char; // if it's a wild letter, remove the wildcard, not the char
      console.log("trying to remove rack letter:", letter_to_remove);
      room.state.players[sessionId].rack.every(function(item, i){
        if(item.char === letter_to_remove){
          console.log("trying to remove rack letter at index:", i);
          room.state.players[sessionId].rack.splice(i, 1);// remove it!
          return false;
        }
        return true;
      })
    }
    
    
    getPlayerRackLetters(sessionId){
      var chars = [];
      this.state.players[sessionId].rack.forEach(function(letter){
        chars.push(letter.char);
      })
      return chars;
    }
    
    
    playWord(sessionId, message){
      console.log("playing word", message);
      var room=this;
      
      this.state.last_played = new ArraySchema();
      
      var letterString = "";
      
      message.letters.forEach(function(letter, i){
      // for(var i=0; i<message.letters.length; i++){
        // var letter = message.letters[i];
        
        console.log("adding letter to square", letter);
        room.state.setSquare(letter.u, letter.v, letter.char, letter.points);
        
        //remove the letter from the player's rack
        room.removeFromRack(room, sessionId, letter);
        
        // add it to the 'last_played' array
        room.state.last_played.push( new Square(letter.u, letter.v, letter.char, letter.points));
        
      });
      
      if(message.score>0){
        console.log("adding SCORE to player.score", message.score);
        this.state.players[sessionId].points += parseInt(message.score);
      }
      
      // add it to the room state history\
      var player = this.state.players[sessionId];
      var turn = new Turn(player.userid, player.name, JSON.stringify(message.words), parseInt(message.score));
      
      console.log("adding turn to history", turn);
      this.state.history.push(turn); //add it to the list of chats
      // console.log("new history: ", this.state.history);
      
      console.log("depleated rack:", this.getPlayerRackLetters(sessionId));
      
      // if it's all a success, then reload the player's rack, and advance the turn
      this.loadPlayerRack(sessionId);
      this.advanceTurn(); 
      
      console.log("refilled rack:", this.getPlayerRackLetters(sessionId))
    }
    
    
    
    
    advanceTurn(){
      var currentTurn = this.state.turn;
      console.log("advancing turn, from ", currentTurn);
      var ids = this.state.getAllUserIDs();
      // this.state.players.forEach(function(p, i){
      //   ids.push(p.userid);
      // });
      
      console.log("player IDS", ids);
      var currentPos = ids.indexOf(currentTurn);
      var nextPlayer = ids[0];
      
      if(currentPos < ids.length-1){
        console.log("looking for next player at...", currentPos+1)
        nextPlayer = ids[currentPos+1];
      }
      
      this.state.turn = nextPlayer;
      console.log("next player is:",  nextPlayer);
      
      this.sendNotification([nextPlayer], 'Your Move', "It's your turn to play a word")
    }
    
    
    
    
    
    // **** spqcial squares
    generateSpecialSquares(type, numSquares){
      console.log("generating special_squares", type, numSquares);
      
      var quadSize = 7;
      var gridSize = 14;
      var quad = 0;
      
      var searches = 0;
      var foundSquares = 0;
      while(searches < 100){ //break if it's been seearching mor ethan 100 randaom squares and can't find any free
        searches += 1;  //just ot make sure we don't looop infinitely
        
        var u_pos = this.randomIntFromInterval(0, quadSize);
        var v_pos = this.randomIntFromInterval(0, quadSize);
        
        var is_free = this.checkSpecialSquares(u_pos, v_pos);
        
        if(u_pos==7 && v_pos==7) is_free=false; //can't use the center square
        
        console.log("RESULT OF CHECK?", u_pos, v_pos, is_free);
        if(is_free==true){
          
          for(quad=0; quad<4; quad++){  //then for each quad, place the same square in a relative position
            var u = u_pos;
            var v = v_pos;
            if(quad==1){
              u = gridSize - u;
            }
            else if(quad==2){
              v = gridSize - v;
            }
            else if(quad==3){
              u = gridSize - u;
              v = gridSize - v;
            }
            
            var sp = new SpecialSquare(u,v,type);
            this.state.special_squares.push(sp);
            
          }
          
          foundSquares += 1;  //increase the counter
          
          
          if(foundSquares >= numSquares) break; //break out of the loop if we've found all we need to
        }
        
      }
      
    }
    
    
    checkSpecialSquares(u_pos, v_pos){
      var is_free = this.state.special_squares.every(function(square, key){
        // console.log("checking for occupied special_square", u_pos, v_pos, square.u, square.v);
        if(square.u==u_pos && square.v==v_pos){
          console.log("found occupied special_square", square.u, square.v);
          is_free = false;
          return false;
        }
        
        // console.log("special_square is free");
        return true;
      });
      
      return is_free;
    }
    
    
    
    
    
    
    randomIntFromInterval(min, max) { // min and max included 
      return Math.floor(Math.random() * (max - min + 1) + min);
    }
    
    randomGameID() {
      return 'xxxxxxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    
    
    
    sendNotification(userids, title, msg){
      const gameUrl = 'https://clabbers.davidhoare.net/play/?game=' + this.gameid;
      console.log("Trying to Send PUSH notification: ", userids, title, msg, gameUrl)
      // See all fields: https://documentation.onesignal.com/reference/create-notification
      const notification = {
        headings: {
          'en': title,
        },
        contents: {
          'en': msg,
        },
        url: gameUrl,
        // include_player_ids: ['4ce36b5d-ba68-4794-be16-50bcfc81721e']
        include_external_user_ids: userids
        // included_segments: ['Subscribed Users'],
        // filters: [
        //   { field: 'tag', key: 'level', relation: '>', value: 10 }
        // ]
      };
      
      
      OsClient.createNotification(notification)
        .then(response => {
          console.log("PUSH response", response.statusCode)
        })
        .catch(e => {
          console.log("PUSH ERROR", e)
        });
      
    }
    
    
}

