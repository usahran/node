var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var cors = require('cors');
var bodyparser = require('body-parser');
var mongodb = require('mongodb').MongoClient;
var session = require('express-session');

app.use(session({
 secret: 'User',
 resave: true,
 saveUninitialized: true
}));

app.set('view engine','ejs');
app.set('views', 'views');

app.use(cors());
app.use(bodyparser.urlencoded({ extended: false }));

var url = "mongodb://localhost:27017";
var db;
var user;
var ids = {};

mongodb.connect(url, function(err, database) {
	db = database;
  if (err) throw err;
});

app.get('/', function(req, res){
	res.sendfile('login.html');
});

app.get('/lib/:item', function(req, res){
	var query = req.params.item;
	if(query == 'bootstrap'){
		res.sendfile('css/bootstrap.css');
	}else if(query == 'bootstrap.min'){
		res.sendfile('css/bootstrap.min.css');
	}else if(query == 'bootstrap.js'){
		res.sendfile('js/bootstrap.js');
	}else if(query == 'bootstrap.min.js'){
		res.sendfile('js/bootstrap.min.js');
	}
});

app.get('/main', function(req, res){
	if(user && user.id && !ids[user.id]){
		res.sendfile('main.html');
	}else{
    emsg = "접속 실패";
		res.render('error', {error:emsg});
	}
});

app.post('/login', function(req, res){
	var uid = req.body.id || req.query.id;
	var upw = req.body.pw || req.query.pw;

	var local = db.db('local');
	var collection = 	local.collection("user");

	collection.find({id:uid,pw:upw}).toArray(function(err, result) {
    if (err) throw err;
		if(result[0] && result[0].id){
			user = {
				id:uid,
				pw:upw
			};
			res.redirect('/main');
		}else{
			emsg = "로그인 실패";
			res.render('error', {error:emsg});
		}
  });
});

app.get('/logout', function(req, res){
	user = null;
	res.redirect('/');
});

app.get('/join', function(req, res){
	res.sendfile('join.html');
});

app.post('/join', function(req, res){
	var uid = req.body.id || req.query.id;
	var upw = req.body.pw || req.query.pw;

	var local = db.db('local');
	var collection = 	local.collection("user");

	if(uid && upw){
		var obj = {
			id:uid,
			pw:upw
		}
		collection.find({id:uid}).toArray(function(err, result) {
			if (err) throw err;
			if(result[0] && result[0].id){
				emsg = "아이디 중복";
				res.render('error', {error:emsg});
			}else{
				collection.insertOne(obj, function(err, res) {
		    	if (err) throw err;
				});
				res.redirect('/');
			}
		});
	}
});

io.on('connection', function(socket){
	console.log('socket: ' + JSON.stringify(socket.request.connection._peername));
  socket.on('disconnect', function(){
  	console.log('disconnect');
    delete ids[socket.loginId];
    user = null;
  });
	if(user && user.id){
		ids[user.id] = socket.id;
		socket.loginId = user.id;
	}
	socket.emit('login', socket.loginId);
  socket.on('message', function(msg){
    console.log(JSON.stringify(msg));

		if(msg.recipent == 'ALL'){
  		io.emit('message', msg);
		}else{
      if(msg.command == 'chat'){
        if(ids[msg.recipent]){
  				io.to(socket.id).emit('message',msg);
  				io.sockets.connected[ids[msg.recipent]].emit('message',msg);
  			}
      }else if(msg.command == 'groupChat'){
        //console.log('groupChat');
        //console.log(msg.recipent);
        io.sockets.in(msg.recipent).emit('message',msg);
      }
		}
  });
  var rooms = getRoomList();

  socket.emit('roomlist', rooms);

  socket.on('room', function(input){
    var message = {
      sender:'Server',
      recipent:'',
      command:'message',
      type:'error',
      data:'접속 실패'
    }
    if(input.command == "create"){
      if(io.sockets.adapter.rooms[input.id]){
        //console.log(io.sockets.adapter.rooms[input.id] + "방이 이미 존재함");
        message.data = "방이 이미 존재함";
      }else{
        socket.join(input.id);
        io.sockets.adapter.rooms[input.id].id = input.id;
        io.sockets.adapter.rooms[input.id].name = input.name;
        io.sockets.adapter.rooms[input.id].password = input.password;
        io.sockets.adapter.rooms[input.id].owner = input.owner;
        message.type = "create";
        message.data = "방이 생성됨";
      }
    }else if(input.command == "update"){
      if(io.sockets.adapter.rooms[input.id] && (io.sockets.adapter.rooms[input.id].owner == input.owner)){
        io.sockets.adapter.rooms[input.id].id = input.id;
        io.sockets.adapter.rooms[input.id].name = input.name;
        io.sockets.adapter.rooms[input.id].password = input.password;
        io.sockets.adapter.rooms[input.id].owner = input.owner;
        message.type = "update";
        message.data = "방이 수정됨";
      }
    }else if(input.command == "delete"){
      //console.log(currentRoom[input.id].owner == input.owner);
      if(io.sockets.adapter.rooms[input.id] && (io.sockets.adapter.rooms[input.id].owner == input.owner)){
        socket.leave(input.id);
        delete io.sockets.adapter.rooms[input.id];
        message.type = "delete";
        message.data = "방이 삭제됨";
      }
    }else if(input.command == "join"){
      if(io.sockets.adapter.rooms[input.id]){
        if(io.sockets.adapter.rooms[input.id].password && io.sockets.adapter.rooms[input.id].password == input.password || !io.sockets.adapter.rooms[input.id].password){
          //console.log(JSON.stringify(io.sockets.adapter.rooms[input.id]) + " " + socket.id + "\n");
          //console.log(JSON.stringify(io.sockets.adapter.rooms));
          //console.log(JSON.stringify(io.sockets.adapter.rooms[socket.id]) + " " + JSON.stringify(io.sockets.adapter.rooms[input.id]));
          message.type = "join";
          message.data = "접속";
          socket.join(input.id);
          console.log(socket.loginId + ' 접속');
        }
      }
    }else if(input.command == "leave"){
      if(io.sockets.adapter.rooms[input.id]){
        console.log(socket.loginId + ' 떠남');
        if(io.sockets.adapter.rooms[input.id].owner != input.owner){
          socket.leave(input.id);
        }
        message.type = "leave";
        message.data = "나가기";
      }
    }
    message.recipent = input.id;
    io.to(socket.id).emit('roomResult',message);
    rooms = getRoomList();
    io.sockets.emit('roomlist', rooms);
  });
});

function getRoomList(){
  var rooms = [];
  Object.keys(io.sockets.adapter.rooms).forEach(function(roomId){
    //console.log(io.sockets.adapter.rooms[roomId]);
    var room = io.sockets.adapter.rooms[roomId];
    var found = false;
    Object.keys(room.sockets).forEach(function(key){
      if(roomId == key)
        found = true;
    });
    if(!found)
      rooms.push(room);
  });
  //console.log(rooms);
  return rooms;
}

http.listen('8888', function(){
  console.log('웹서버 실행');
});
