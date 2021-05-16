// ****** GLOBAL CONSTANTS
const gridsize = 15;
const alphabet = "abcdefghijklmnopqrstuvwxyz";

var currentWords = [];  //used to track active correct words placed, before sending them

// setup the GRID
for (var v = 0; v <= gridsize-1; v++ ) {
  for (var u = 0; u <= gridsize-1; u++ ) {
    var el = '<div class="square" data-u="'+u+'" data-v="'+v+'" id="sq_'+u+'_'+v+'"></div>';
    // console.log("adding grid square: ", u, v);
    $("#grid").append(el);
  }
}





// ***** GAME ROOM AND USERNAME SETUP

var url = new URL(window.location.href);

var gameid = randomGameID();
if(url.searchParams.get("game")){
  gameid = url.searchParams.get("game");
}
else if(typeof localStorage.gameid != 'undefined' && localStorage.gameid != "null" && localStorage.gameid != null){
  gameid = localStorage.gameid;
}
localStorage.gameid=gameid; //save it anyway
//then append it to the URL if it's not already there

if(!url.searchParams.get("game")){
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set('game', gameid);
  window.location.search = urlParams;
}



// store it in localstorage if it's not already
// var pastgames=[];
// if(typeof localStorage.games != 'undefined' && localStorage.games != "null" && localStorage.games != null){
//   if(JSON.parse(localStorage.games)){
//     pastgames = JSON.parse(localStorage.games);
//     if(array.indexOf(newItem) === -1){
      
//     }
//   } 
// }




//create the userid, or fetch it from storage for now...
// var my_userid = uuid();
// if(typeof localStorage.my_userid != 'undefined' && localStorage.my_userid != "null" && localStorage.my_userid != null){
//   my_userid = localStorage.my_userid;
// }

var usercookie = Cookies.get('user');
if(usercookie){
  var userdata = JSON.parse(usercookie);
  if(userdata && userdata.id){
    var my_userid = userdata.id;
    var playername = userdata.name;
    console.log("google cookie?", userdata);
  }else{
    console.log("bad cookie data, or missing ID, so bouncing to frontdoor");
    window.location.href='/?re='+gameid;
  }
}
else{
  console.log("NO cookie, so bouncing to frontdoor");
  window.location.href='/?re='+gameid;
}



// var playername = 'player';
// if(localStorage.playername){
//   playername = localStorage.playername;
// }else{
//   playername = prompt("Choose a player name:", 'Player_'+randomIntFromInterval(0000,9999));
//   if(!playername) playername = 'Player_'+randomIntFromInterval(0000,9999);
//   localStorage.playername = playername;
// }
  



// ********** COLYSEUS CONNECTION
const endpoint = `${window.location.protocol.replace("http", "ws")}//${
  window.location.hostname
}`;
var client = new Colyseus.Client(endpoint);

var room;
var IS_JOINED = false;

function connectToRoom(){
  // Connect to the chatroom
  client
    .joinOrCreate("mygame", { gameid: gameid, userid: my_userid, name:playername })
    .then(myroom => {
      room = myroom;
      console.log(room.sessionId, "joined", room.name);
      IS_JOINED=true;
      
      room.onLeave((code) => {
        console.log(client.id, "left", room.name);
        IS_JOINED=false;
      });
      
      room.onMessage("update_dice", data => {
        console.log("current_roll data", data);
      });
    
      room.onMessage("update_rack", data => {
        // console.log("updating rack data");
        setTimeout(function(){
          loadPlayerRack(room.state.players[room.sessionId].rack);
        }, 500);
      });
    
    
      room.onMessage("bag_letters", data => {
        // console.log("updating bag_letters data", data);
        updateBag(data);
      });
    
    
      room.onMessage("spellcheck_result", data => {
        console.log("got spellcheck_result", data);
        if(data.action=='lookup'){
          doSpellLookupResult(data.result);
        }
        
        if(data.action=='letters_placed'){
          doSpellPlacedLetters(data);
        }
        
      });
    
    
      room.state.players.onAdd = (player, key) => {
          console.log("player", player, "has been added at", key);
          // add your player entity to the game world!
          updatePlayerList();
          
          // If you want to track changes on a child object inside a map, this is a common pattern:
          player.onChange = function(changes) {
              changes.forEach(change => {
                  console.log("player change: ", player.userid, change.field, change.value)
                  
                  if(change.field=='rack' && player.userid==my_userid){
                    loadPlayerRack(change.value);
                  }
                  
                  if(change.field=='name'){
                  // $(".player_box[data-id='"+player.userid+"']").text("Player: " + change.value);
                    updatePlayerList();
                  }
                  
                  if(change.field=='points'){
                  // $(".player_box[data-id='"+player.userid+"']").text("Player: " + change.value);
                    updatePlayerList();
                  }
              })
          };
          
          
          player.rack.onAdd = (letter, key) => {
              // console.log("player RACK has ADDITIONS at", key);
              
              letter.onChange = function(changes) {
                // console.log("rack LETTER has changes", changes);
                loadPlayerRack(room.state.players[room.sessionId].rack);
              };
              
          };
          
          player.rack.onRemove = (player, key) => {
              // console.log("player RACK has REMOVED an item", key);
          };
          
          
          // force "onChange" to be called immediatelly
          player.triggerAll();
      };
      
      room.state.players.onRemove = (player, key) => {
          console.log("player", player, "has been removed at", key);
          updatePlayerList();
      };
      
      room.state.squares.onAdd = (square, key) => {
          console.log("square", square, "has been added at", key);
          // addLetterAt(square.u, square.v, square.char);
          
          // If you want to track changes on a child object inside a map, this is a common pattern:
          square.onChange = function(changes) {
            addLetterAt(square.u, square.v, square.char, square.points);
            // updateSquares();
              // changes.forEach(change => {
              //     console.log("square change: ", change.field, change.value)
              // })
          };
          // force "onChange" to be called immediatelly
          // square.triggerAll();
          
      };
      
      
      room.state.squares.onRemove = (square, key) => {
          console.log("square", square, "has been REMOVED at", key);
          $("#sq_"+key).find(".letter").remove();
      };
      
      
    
      room.state.listen("turn", (currentValue, previousValue) => {
          console.log(`current TURN is now ${currentValue} (previous value was: ${previousValue})`);
          // $(".player_box").removeClass("is-success");
          // $(".player_box[data-id='"+currentValue+"']").addClass("is-success");
          updatePlayerList();
          setTimeout(function(){
            updateLastPlayed();
          },500)
      });
    
      room.state.listen("counter", (currentValue, previousValue) => {
          console.log(`counter is now ${currentValue} (previous value was: ${previousValue})`);
      });
      
    
      room.state.chat.onAdd = (msg, key) => {
          updateChat();
          msg.onChange = function(changes) {
            updateChat();
          };
      };
    
    
      room.state.history.onAdd = (msg, key) => {
          updateHistory();
          msg.onChange = function(changes) {
            updateHistory();
          };
      };
    
    
    // *** special squares
      room.state.special_squares.onAdd = (sq, key) => {
        // console.log("special_square added", sq, key)
        setSpecialSquare(sq);
          // sq.onChange = function(changes) {
          //   console.log("special_square changed", changes)
          // };
      };
      room.state.special_squares.onRemove = (sq, key) => {
          // console.log("special_square", sq, "has been removed at", key);
          clearSpecialSquare(sq);
      };
    
    
      room.state.last_played.onAdd = (square, key) => {
          updateLastPlayed();
          square.onChange = function(changes) {
            updateLastPlayed();
          };
          
      };
    
      
          
      })
    .catch(e => {
      console.log("JOIN ERROR", e);
      IS_JOINED = false;
    });
}
connectToRoom();

function flashChat(){
  $("#chat_toggle").addClass("animate__tada").addClass("newmessage");
  setTimeout(function(){
    $("#chat_toggle").removeClass("animate__tada");
  },2000)
}


function updateChat(){
  $("#chat_messages").empty();
  room.state.chat.forEach(function(msg, key) {
    // console.log("adding chat msg", msg);
    // var data = JSON.parse(msg);
    
    $obj = $("<div class='chat_msg'><span class='chat_name'>"+msg.name+": </span>"+msg.text+"</div>");
    if(msg.userid == my_userid){
      $obj.addClass('mine');
    }
    $("#chat_messages").prepend($obj);
  });
  if($(".chat_msg").first().hasClass('mine') == false){
    flashChat();
  }
}


function updateHistory(){
  $("#history_log").empty();
  room.state.history.forEach(function(msg, key) {
    // console.log('trying to add HISTORY words', msg);
    var words = JSON.parse(msg.letters);
    var wordString = "";
    for(var key in words){
      wordString += words[key].word_string;
      if(key < words.length-1) wordString += ', ';
    }
    
    $obj = $("<div class='history_item'><span class='history_name'>"+msg.name+": </span>"+wordString+" : " + msg.score + "</div>");
    if(msg.userid == my_userid){
      $obj.addClass('mine');
    }
    $("#history_log").prepend($obj);
  });
}


function updateLastPlayed(){
  $(".letter").removeClass("last_played");
  room.state.last_played.forEach(function(square, key) {
    var key = "#sq_"+square.u+"_"+square.v+" .letter";
    // console.log("updating last_played", square.u, square.v, square.char, key);
    var $obj = $(key);
    if($obj.length>0){
      $obj.addClass('last_played');
    }
  });
}


function updatePlayerList(){
  $("#player_row").empty();
  room.state.players.forEach(function(player, key) {
    console.log("adding player", player);
    $obj = $("<div class='level-item'><div class='player_box button is-fullwidth' data-id='"+player.userid+"'><span class='player_name'>"+player.name+"</span>&nbsp;(<span class='player_score'>"+player.points+"</span>)</div></div>");
    $("#player_row").append($obj);
  });
  
  updateTurnDisplay();
}


function updateTurnDisplay(){
  $(".player_box").removeClass("is-success");
  $(".player_box[data-id='"+room.state.turn+"']").addClass("is-success");
  
  if(room.state.turn==my_userid){
    console.log("it's THIS player's turn", room.state.turn, my_userid);
    $("#btn_play_word").attr("disabled", false);
    $("#game").addClass("myturn");
  }
  else{ //not my turn
    $("#btn_play_word").attr("disabled", "disabled");
    $("#game").removeClass("myturn");
  }
}




function updateSquares(){
  room.state.squares.forEach(function(sq, key) {
    console.log("adding square data", sq);
    addLetterAt(sq.u, sq.v, sq.char, sq.points);
  })
}




function addLetterAt(u, v, char, points, player_added){
  
  var $letter = $("<div class='letter' data-points='"+points+"' style='--points: \""+points+"\";'></div>");
  $letter.text(char);
  
  if(player_added===true){
    $letter.addClass('mine');
    
    // deal with wild...
    if(char == "_"){
      console.log("this is a wild...");
      var newChar = prompt("What letter should this tile be?");
      if(newChar){
        newChar = newChar.trim().charAt(0).toLowerCase();
        if(!isLetter(newChar)){
          alert("Sorry, that's not a valid letter. Please try again.");
          return false;
        }else{
          console.log("it's a good new letter: ", newChar);
          $letter.text(newChar);
          $letter.addClass('wild');
        }
      }else{
        return false;
      }
    }
    
    $letter.draggable({
      revert:true,
      revertDuration: 0,
      containment: '#main',
      connectToSortable: "#rack",
      start: function(event, ui){
        console.log("drag start, clearing all indicators", ui.helper);
        $(".letter").removeClass("i_good").removeClass("i_bad");//clear any indicators
        
        ui.helper.parent().droppable( "enable" );
      }
    });
    
  }
  
  var $target = $(".square[data-u='"+u+"'][data-v='"+v+"']");
  if($target.find(".letter").length > 0){
    console.log("it's full, so not adding")
    return false;
    
  }else{
    // console.log("adding letter at", u, v, char);
    try{
      $target.append($letter)
        .droppable( "disable" );
    }catch(e){
      console.log("can't disable droppable")
    }
  }
}


function loadPlayerRack(letters){
  // console.log("loading rack with letters")
  $("#rack").empty();
  letters.forEach(function(letter, key) {
    // console.log('adding letter', letter.char);
    addLetterToRack(letter.char, letter.points);
  });
  
}

function addLetterToRack(char, points){
  // console.log("adding letter to rack")
  var $letter = $("<div class='letter' data-points='"+points+"' style='--points: \""+points+"\";'>"+char+"</div>");
  $("#rack").append($letter);
}


function updateBag(letters){
  $("#bag_letters").empty()
  
  letters = letters.sort(letterSort)
  
  letters.forEach(function(letter, i){
    // console.log("adding letters to 'bag'", letter.char);
    $letter = $("<div class='bag_letter'>"+letter.char+"</div>");
    $("#bag_letters").append($letter);
  })
  
  $("#bag_letter_count").text(letters.length);
  
}



function playCurrentWord(){
  
  // check first-turn using center square
  if(room.state.history.length==0) {
    console.log("FirstTurn, so making sure something's on the start square");
    
    if( $("#sq_7_7 .letter").length==0){ //if there's no letter on the middle square
      alert("Please place your first word on the middle square.");
      return false;
    }
  }
  
  
  console.log("playing current word");
  checkWords();
  $("#spinner").show();
  $("#btn_play_word").attr("disabled", "disabled"); //disable for now...
  
  
  // setup the 'submit timer / spinner'
  setTimeout(function(){
    $("#spinner").hide();
    
    // if there's any bad indicators on the board...
    if($(".letter.i_bad").length > 0){
      alert("Whoops - there's a bad word on the board...");
      $("#btn_play_word").attr("disabled", false);
      
    }
    else{
      // we're good to go
      
      // get all 'mine' letters, and their coordinates and points
      var letters = [];
      $(".letter.mine").each(function(){
        var letter = {};
        var square = $(this).parent();
        
        letter.char = $(this).text();
        letter.points = $(this).data('points'); 
        letter.u = square.data('u'); 
        letter.v = square.data('v'); 
        letter.wild = ($(this).hasClass('wild'));
        
        letters.push(letter);
      })
      
      var score = 0;
      $('.letter[data-score]').each(function(){
        var foundScore = $(this).attr("data-score");
        console.log("found a SCORE", this, foundScore)
        score  += parseInt(foundScore);
      });
      
      if(score>0){
        console.log("sending letters", {letters: letters, score: score});
        room.send("play_word", {letters: letters, score: score, words: currentWords});
        
        // cleanup board
        $(".letter.mine").removeClass("mine");
        $(".letter")
          .removeClass("i_good")
          .removeClass("i_bad")
          .removeClass("wild")
          .removeAttr("data-score")
          .css("--score", '')
          ;//clear any indicators and score attributes
      
        
      }else{
        console.log("not sending, because NO SCORE", score);
        $("#btn_play_word").attr("disabled", false);
      }
      
      
    }
  },1000);
  
}



function resetGame(){
  console.log("resetGame");
  if(confirm("Are you SURE you want to reset the whole game?\nThere is no UNDO...")==true){
    console.log("ok, resetting");
    room.send("reset_game");
    $("#grid .letter").remove();
    $(".square.ui-droppable-disabled").removeClass("ui-droppable-disabled");
    $(".square").droppable( "enable" );
  }
}


function newMatch(){
  console.log("newMatch");
  if(confirm("Are you SURE you want leave this game IN-PLAY and start a new fresh one?")==true){
    console.log("ok, going to new match");
    newGameID = randomGameID();
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('game', newGameID);
    window.location.search = urlParams;
  }
}



function doSpellLookupResult(result){
  if(result.misspelled == false){
    $('#dict_lookup').addClass('correct');
  }else{
    $('#dict_lookup').addClass('misspelled');
  }
  
  if(result.suggestions.length>0){
    $("#spell_results").empty();
    result.suggestions.forEach(function(word, i){
      $("#spell_results").append("<li>"+word+"</li>");
    })
  }else{
    $("#spell_results").text("no results...")
  }
}


function doSpellPlacedLetters(data){
  console.log("got spelling result for letter", data);
  var i_class='i_bad';  //default
  
  // if it's a VALID word
  if(data.result==true){
    i_class='i_good';
  }
  
  var first_letter = data.message.first_letter;
  
  //append the result_object to the first_letter
  var $target = $("#sq_"+first_letter).find(".letter").first();
  $target.removeClass("i_good").removeClass("i_bad").addClass(i_class);
  
  if(data.result==true){
    //calculate and add indicator for points
    var wordScore = calcScore(data.message.letters);
    
    var wordString  = makeWordString(data.message.letters);
    currentWords.push({word_string: wordString, word_score: wordScore});
    
    var previousScoreVal = $target.attr("data-score") ? parseInt($target.attr("data-score")) : 0;
    var newScore = previousScoreVal + wordScore;
    console.log("newScore for this word: ", data.message.letters, newScore);
    
    $target.attr('data-score',  newScore); //add to any existing score if there is
    $target.css('--score' , '');  //clear current indicator
    $target.attr('style', $target.attr("style") + "; --score:'" + newScore + "'");
  }
}


function calcScore(letters){
  console.log("calcScore", letters);
  var wordMultiplier = 1;
  var score = 0;
  for (var key in letters){
    var letter = letters[key];
    var letterPoints = parseInt(letter.points);
    
    //check for special 'letter' multipliers
    if($("#sq_"+letter.id).hasClass("l2")) letterPoints*=2;  //multiply by 2
    if($("#sq_"+letter.id).hasClass("l3")) letterPoints*=3;  //multiply by 3
    
    if($("#sq_"+letter.id).hasClass("w2")) wordMultiplier*=2;  //multiply by 2
    if($("#sq_"+letter.id).hasClass("w3")) wordMultiplier*=3;  //multiply by 3
    
    score += parseInt(letterPoints);
  }
  score = score * wordMultiplier; //multiply the whole word by any multipliers discovered
  
  return parseInt(score);
}


// THIS IS A BIGGIE - - determin the active word (or words!), and check each spelling
function checkWords(){
  console.log("checking words");
  
  $(".letter").removeClass("i_good").removeClass("i_bad");//clear any indicators
  $(".letter").removeAttr("data-score");//clear any scores
  currentWords = [];  //global list for submitting
  
  var words = [];
  
  // isolate all placed letters...
  var placed_letters = [];
  $(".letter.mine").each(function(){
    var letter = getLetterDetails($(this));
    placed_letters[letter.id] = letter;
    placed_letters = placed_letters.sort(keySort);
  })
  
  console.log("placed_letters", placed_letters);
  
  // for each of the placed letters, get any connected vertical or horizontal words
  // placed_letters.forEach(function(letter, key){
  for (var key in placed_letters){
    var letter = placed_letters[key];
    console.log("checking connected words for this letter", key);
    var connected = getConnected('vertical', letter.u, letter.v);
    if(connected) words.push(connected);
    
    var connected = getConnected('horizontal', letter.u, letter.v);
    if(connected) words.push(connected);
  }
  console.log("got new connected words", words);
  
  var new_words = [];
  for(var key in words){
    // console.log("checking if word is already in filtered list", new_words, words[key]);
    var alreadyInList = isArrayInList(new_words, words[key]);
    // console.log("already in list?", alreadyInList);
    if(alreadyInList == false){
      new_words.push(words[key]);
    } 
  }
  
  console.log("filtered unique words", new_words);
  
  // check the spelling on each of the new_words
  for(var key in new_words){
    var word =  new_words[key];
    wordString = makeWordString(word);
    
    room.send("check_spelling",{
      action:'letters_placed', 
      word: wordString, 
      suggestions:false, 
      first_letter: word[0].id,
      letters:word
    });
  }
  
  
  
}


function makeWordString(word){
  var str = "";
  for(var key in word){
    str += word[key].char;
  }
  return str;
}


function isArrayInList(original, newArray){
  for(var key in original){
    // console.log("comparing a and b", newArray, original[key]);
    var found = arraysEqual(newArray, original[key]);
    if(found){
      return true;
    }
  }
  return false;
}


function getLetterDetails(element){
  var letter = {
    id: element.parent().data('u') + "_" + element.parent().data('v'),
    u: element.parent().data('u'),
    v: element.parent().data('v'),
    char: element.text(),
    points: element.data('points')
  }
  return letter
}

function getTileAtCoords(u,v){
  // console.log("getting letter at coordinate:", u, v);
  var $target = $(".square[data-u='"+u+"'][data-v='"+v+"']");
  
  if($target[0]){
    var found = $target.find(".letter").first();
    
    if($target.find(".letter").length == 1){
      return found;
    }else{
      return false;
    }
  }else{
    return false;
  }
}



function getConnected(direction, u, v){
  var searching = true;
  var connected = [];
  var start_u = u;
  var start_v = v;
  
  if(direction=='vertical'){
    // console.log("starting vertical search");
    //start DOWN
    while(searching==true){
      foundLetter = getTileAtCoords(u,v);
      if(foundLetter==false){  //if we can't find one, then stop
        searching=false;
        console.log("no more found down, stopping that search");
      }else{
        connected.push(getLetterDetails(foundLetter))
        v++;
      }
    }
    //reset for UP;
    u = start_u;
    v = start_v-1;
    searching=true;
    while(searching==true){
      foundLetter = getTileAtCoords(u,v);
      if(foundLetter==false){  //if we can't find one, then stop
        searching=false;
        console.log("no more found UP, stopping that search");
      }else{
        connected.unshift(getLetterDetails(foundLetter))
        v--;
      }
    }
  }
  
  
  else if(direction=='horizontal'){
    // console.log("starting horizontal search");
    //start RIGHT
    while(searching==true){
      foundLetter = getTileAtCoords(u,v);
      if(foundLetter==false){  //if we can't find one, then stop
        searching=false;
        console.log("no more found RIGHT, stopping that search");
      }else{
        connected.push(getLetterDetails(foundLetter))
        u++;
      }
    }
    //reset for LEFT;
    u = start_u-1;
    v = start_v;
    searching=true;
    while(searching==true){
      foundLetter = getTileAtCoords(u,v);
      if(foundLetter==false){  //if we can't find one, then stop
        searching=false;
        console.log("no more found LEFT, stopping that search");
      }else{
        connected.unshift(getLetterDetails(foundLetter))
        u--;
      }
    }
  }
  
  if(connected.length > 1){
    
    console.log("connected letter", connected);
    return connected;
  }
  else{
    console.log("no connected letters");
    return false
  }
}



// ****** special squares
function setSpecialSquare(sq){
  console.log("setting special_square", sq);
  
  $square = $("#sq_" + sq.u +"_"+ sq.v);
  // console.log("square", $square);
  $square.addClass("special").addClass(sq.type);
}

function clearSpecialSquare(sq){
  console.log("clearing special_square", sq);
  $square = $("#sq_" + sq.u +"_"+ sq.v);
  $square.removeClass("special").removeClass(sq.type);
}






// share button
function doShare(){
  if(navigator.share){
    const shareData = {
      title: 'Clabbers',
      text: 'Join my game here:',
      url: window.location.href
    }
    navigator.share(shareData);
  }
  else{
    // alert("To invite a friend to join this game, just share this page's URL: \n" + window.location.href);
    $("#invite_link").attr('href', window.location.href).text(window.location.href);
    $("#invite_box").addClass("is-active");
  }
  
}


// deal with one-signal notifications (mute/unmute) based on browser presence
lifecycle.addEventListener('statechange', function(event) {
  // console.log("LIFECYCLE EVENT (old/new/original ):", event.oldState, event.newState, event.originalEvent.type);
//   if the page is focused, then mute notifications...
  if(event.newState=="active"){
    // OneSignal.setSubscription(false);
    room.send("is_active", {state:true});
    
    //also check if the room is connected, and if it's not, then reconnet...
    if(IS_JOINED==false){
      // console.log("IS_JOINED==false, so trying to reconnect");
      connectToRoom();
    }else{
      // console.log("room still joined", IS_JOINED)
    }
    
  }else{
    // OneSignal.setSubscription(true);
    room.send("is_active", {state:false});
  }
});













// ****** DOCUMENT READY
// ****** DOCUMENT READY
// ****** DOCUMENT READY
$( function() {

    
  $( ".square" ).droppable({
    accept: ".letter",
    drop: function( event, ui ) {
      
      // if it's not my turn, revert
      if(room.state.turn != my_userid) return false;
      
      
      // otherwise, add it
      var char = ui.draggable.text();
      if(ui.draggable.hasClass('wild')) char = '_';  //reset the char to 'underscore' if it had previously been wild
      var success = addLetterAt($(this).data("u"), $(this).data("v"), char, ui.draggable.data('points'), true); //'true' means it's MINE
      
      //if it doesn't drop, then revert to the rack
      if(success===false){
        return false;
      }
      ui.draggable.remove();  //remove it from the rack
      
      // check the spelling on any new words
      checkWords();
      
    }
  });



  $( "#rack" ).sortable({
    forceHelperSize: true,
    forcePlaceholderSize: true,
    opacity: 0.6,
    // cursorAt: { top: 25, left: 25 },
    // animation: 200,
    // axis: 'x',
    // connectWith: '.square',
    receive: function( event, ui ) {
      // console.log("dropped item", ui.item);
      // console.log("onto this item", $(this));
      var char = ui.item.text();
      var points = ui.item.data('points');
      if(ui.item.hasClass('wild')) char = '_';  //reset the char to 'underscore' if it had previously been wild
      
      ui.item.remove();
      
      addLetterToRack(char, points);
      checkWords(); //just in case things have changed on the board now...
    }
  });
  $( "#rack" ).disableSelection();
  
  
  
  
  //change a wildcard
  $("#grid").on("dblclick", ".wild", function(){
    var newChar = prompt("What letter should this tile be?");
    if(newChar){
      newChar = newChar.trim().charAt(0).toLowerCase();
      if(!isLetter(newChar)){
        alert("Sorry, that's not a valid letter. Please try again.");
        return false;
      }else{
        console.log("it's a good new letter: ", newChar);
        $(this).text(newChar);
        
        setTimeout(function(){
          checkWords();
        },250);
      }
    }
  });
  
  // temp manually add letters to rack
  // for(var i=0; i<7; i++){
  //   addLetterToRack(randomCharacter());
  // }
  
  
  $("#btn_play_word").click(function(){
    playCurrentWord();
  })
  
  
  $("#bag_btn_close").click(function(){
    $('#bag').hide();
  })
  
  $("#btn_bag").click(function(){
    $('#bag').show();
  })
  
  $("#btn_shuffle").click(function(){
    $("#rack .letter").randomize();
  })
  
  
  $("#btn_recall").click(function(){
    $(".letter.mine").remove();
    loadPlayerRack(room.state.players[room.sessionId].rack);
    $(".square.ui-droppable-disabled").removeClass("ui-droppable-disabled").droppable( "enable" );
    $(".letter").removeClass("i_good").removeClass("i_bad");//clear any indicators
    $(".letter").removeAttr("data-score");//clear any scores
    
    currentWords = [];
  })
  
  
  $("#header").on("click", ".player_box", function(){
    console.log("playedbox clicked")
    if($(this).data('id') == my_userid){
      console.log("clicked on MY name")
      // var newName = prompt("Change your username:", room.state.players[room.sessionId].name);
      // console.log("New Name:", newName);
      // if(newName!=""){
      //   newName = newName.replace(/[^\w\s]/gi, '');
      //   room.send('update_name', {name: newName});
      //   localStorage.playername = newName;
      // }
    }else{
      console.log("clicked on OTHER player's name", $(this).data('id'));
      if(confirm("Are you SURE you want to remove this player from the game completely? " + $(this).text())){
        room.send("remove_player_from_game", $(this).data('id'));
      }
    }
  })
  
  
  // ******* dictionary lookup UI EVENTS
  $("#dict_lookup").on("focus", function(){
    $("#spell_results").text("no results...").show();
    $(this).val('').removeClass('correct').removeClass('misspelled');
  })
  
  $("#dict_lookup").on("blur", function(){
    $("#spell_results").hide();
    $(this).val('').removeClass('correct').removeClass('misspelled');
  })
  
  
  $('#dict_lookup').keydown(debounce(function (event) {
    //clear styles
    $('#dict_lookup').removeClass('correct').removeClass('misspelled');
    
    // do the lookup
    console.log("checking spelling on word", this.value);
    if(this.value!=''){
      room.send("check_spelling",{action:'lookup', word: this.value, suggestions:true})
    }
    
  }, 250));
  
  
  // history window
  $("#history_toggle").click(function(){
    $("#history_window").toggleClass('stashed');
  })
  
  
  // chat
  $("#chat_entry").on("focus", function(){
    $("#chat_toggle").removeClass("newmessage");
  });
  $("#chat_entry").on("change", function(){
    var msg = this.value;
    console.log("sending chat msg", msg);
    room.send('chat_entry', msg);
    $(this).val("");
  });
  
  
  $("#chat_toggle").click(function(){
    $("#chat_window").toggleClass('stashed');
    $("#chat_toggle").removeClass('newmessage');
  })
  
  
  $(".modal-close").click(function(){
    $(this).closest(".modal").removeClass('is-active');
  })
  
  
  
  
  // if main window is wide enough, show the chat panel
  var chatWidth = $("#chat_window").width();
  var gameWidth = $("#main").width();
  var windowWidth = $("html").width();
  var sideSpace = (windowWidth - gameWidth) / 2;
  // console.log("sideSpace", sideSpace);
  if(sideSpace > chatWidth){
    $("#chat_window").removeClass('stashed');
    $("#history_window").removeClass('stashed');  //also history window
  }
  
  
});
// ****** END DOCUMENT READY


/*GENERIC FUNCTIONS*/
/*GENERIC FUNCTIONS*/
/*GENERIC FUNCTIONS*/
function randomIntFromInterval(min, max) { // min and max included 
  return Math.floor(Math.random() * (max - min + 1) + min);
}


jQuery.fn.sortDivs = function sortDivs() {
    $("> div", this[0]).sort(dec_sort).appendTo(this[0]);
    function dec_sort(a, b){ return ($(b).data("sort")) < ($(a).data("sort")) ? 1 : -1; }
}

jQuery.fn.randomize = function(selector){
    (selector ? this.find(selector) : this).parent().each(function(){
        $(this).children(selector).sort(function(){
            return Math.random() - 0.5;
        }).detach().appendTo(this);
    });

    return this;
};


function randomCharacter(){
  return alphabet[Math.floor(Math.random() * alphabet.length)]
}

function randomGameID() {
  return 'gxxxxxxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}


function debounce(fn, delay) {
  var timer = null;
  return function () {
    var context = this, args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () {
      fn.apply(context, args);
    }, delay);
  };
}

function letterSort(a,b){
  if (a.char < b.char) {
    return -1; //nameA comes first
  }
  if (a.char > b.char) {
    return 1; // nameB comes first
  }
  return 0;  // names must be equal
}

function keySort(a,b){
  if (a < b) {
    return -1; //nameA comes first
  }
  if (a > b) {
    return 1; // nameB comes first
  }
  return 0;  // names must be equal
}

function arraysEqual(arr1, arr2) {
  console.log("comparing arrays:", arr1, arr2);
    if(arr1.length !== arr2.length){
      // console.log("arrays are DIFFERENT length")
      return false;
    }
    for(var i = arr1.length; i--;) {
        // if(arr1[i] !== arr2[i]){
        if(JSON.stringify(arr1[i]) !== JSON.stringify(arr2[i]) ){
          // console.log("arrays are DIFFERENT")
          return false;
        }
    }
    // console.log("arrays are the same")
    return true;
}


function doTest(){
  console.log("running test!");
  room.send("test", {data:true});
}


function getMyLetters(){
  chars = [];
  room.state.players[room.sessionId].rack.forEach(function(letter, key){
      // console.log("rack letter", letter.char);
    chars.push(letter.char);
  });
  return chars;
}

function isLetter(str) {
  return str.length === 1 && str.match(/[a-z]/i);
}