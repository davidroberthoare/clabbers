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


// STATE CLASS
class MyState extends Schema {
  constructor() {
    super();
    // this.history = '';
    this.debug = '';
  }
}

schema.defineTypes(MyState, {
  // history: "string",
  debug: "string"
});


// ****** GLOBAL CONSTANTS

exports.myLobbyRoom = class extends colyseus.Room {
    // When room is initialized
    onCreate (options) { 
        console.log("creating LOBBY", options);
        
        this.setState(new MyState())
        
        
        this.onMessage("test", (client, message) => {
          console.log("got message of type, 'TEST'");
          var ids = this.state.getAllUserIDs();
          this.sendNotification(ids, "Hello World", "This is a test message");
          
        });
        
        
        this.onMessage("delete_game", (client, roomid) => {
          console.log("got message of type, 'delete_game'", roomid);
          if(typeof roomid != 'undefined' && roomid !=''){
            this.deleteGame(this, client, options, roomid);
          }
        });
        
        
      // ******* end of onCreate message listener functions
    }
    
    // When client successfully join the room
    onJoin (client, options, auth) { 
      console.log("client joined the lobby:", client.sessionId, options.userid);
      
      this.updateHistory(this, client, options)
      
    }

    // When a client leaves the room
    onLeave (client, consented) { 
      console.log("client left", client);
    }

    // Cleanup callback, called after there are no more clients in the room. (see `autoDispose`)
    onDispose () { 
      console.log("room disposed");
    }
    
    
    
    updateHistory(room, client, options){
      var history = {};
      // var room = this;
      
      var key = "player_games:" + options.userid;
      cledis.smembers(key,
        function(err, res) {
          console.log("GAMES FOUND", res, err);
          if(res){
            for (const gameid of res) {
              console.log("checking for players in this gameID", gameid);
                
                history[gameid] = {last_active_at: Date.now(), players: []};
                
                
                        
                var key = "game_state:"+gameid;
                console.log('LOADING game STATE', key);
                cledis.hmget(key, "players", "last_active_at", "last_played", 
                  function(err, res) {
                    if(res){
                      
                      if(res[0]){
                        const playerData = JSON.parse(res[0]);
                        if(playerData){
                          console.log("found player", playerData);
                          history[gameid].players = playerData;
                        }
                      }
                      
                      if(res[1]){
                        console.log("last_active_at", res[1]);
                        history[gameid].last_active_at = res[1] ;
                      }
                      
                      if(res[2]){
                        const playData = JSON.parse(res[2]);
                        if(playData){
                          console.log("last_played", playData);
                          history[gameid].last_played = playData ;
                        }
                      }
                      
                      // room.state.history = JSON.stringify(history);
                    }
                  }
                );
                      
            }
          }
        }
      );
      
      setTimeout(function(){
        console.log("new game history", history)
        // this.sendJSON.stringify(history)
        client.send("history", history);
      },500)
      
        
      
    }
    
    
    // functions
    deleteGame(room, client, options, roomid){
      var userid = options.userid;
      
      // delete player states
      var pattern = 'game_player_state:'+roomid+":*";
      console.log('deleting:', pattern);
      this.deleteKeysByPattern(pattern, function(){console.log("done deleting")});
      
      //also remove the player_list
      var gamekey = "game_players:" + roomid;
      console.log('deleting key:', gamekey, roomid);
      cledis.del(gamekey, function(deleteErr, deleteSuccess){
          console.log(gamekey, deleteSuccess);
      });
            
      //also remove from state
      var statekey = "game_state:" + roomid;
      console.log('deleting key:', statekey, roomid);
      cledis.del(statekey, function(deleteErr, deleteSuccess){
          console.log(statekey, deleteSuccess);
      });
            
      //also remove from my list
      var playerkey = "player_games:" + userid;
      console.log('deleting from list:', playerkey, roomid);
      cledis.srem(playerkey, roomid, function(deleteErr, deleteSuccess){
        console.log(playerkey, roomid, deleteSuccess);
      });
      
      
      this.updateHistory(room, client, options)
      
    }
    
    
    deleteKeysByPattern(pattern, callback){
    
      cledis.scan('0', 'MATCH', pattern,'COUNT', '1000', function(err, reply){
        console.log('scan results', reply, err);
        if(err){
            throw err;
        }
        var keys = reply[1];
        // console.log("trying to delete keys:", keys)
        keys.forEach(function(key,i){                     
          // console.log("actually deleting key:", key)
            cledis.del(key, function(deleteErr, deleteSuccess){
                console.log(key, deleteSuccess);
            });
        });


        return callback();
      });
    }
    
}

