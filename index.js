'use strict';

require('dotenv').config();
const BootBot = require('bootbot');
const fetch = require('node-fetch');
const Clarifai = require('clarifai');

console.log(process.env.CLARIFAI);

let USERS = [];

function getLocation(place) {
    const url = encodeURI(`https://maps.googleapis.com/maps/api/geocode/json?address=${place}`);
    return fetch(url)
        .then(res => res.json())
        .catch(err => console.log(`Error getting user profile: ${err}`));
}

const findLocation = (payload, convo) => {
  const userId = payload.sender.id;
  if (payload !== undefined && payload.message !== undefined && payload.message.text !== undefined) {
    const text = payload.message.text;
    console.log('LOCATION', text);
    getLocation(text).then((res) => {
      const address = res.results[0].formatted_address;
      const lat = res.results[0].geometry.location.lat;
      const lng = res.results[0].geometry.location.lng;
      const found = USERS.find(elem => elem._id === userId);
      if (!found) {
        USERS.push({ _id: payload.sender.id, address, lat, lng });
      } else {
        found.address = address;
        found.lat = lat;
        found.lng = lng;
      }
      convo.say({
        text: 'Sua localização é ' + address + '?',
        quickReplies: [
          { content_type: 'text', title: 'Sim', payload: 'ADDRESS_YES' },
          { content_type: 'text', title: 'Não', payload: 'ADDRESS_NO' }
        ]
      }, { typing: true });
    });
  } else {
    convo.say('Tive problemas em achar sua localização').then(() => {
       convo.say('Você pode tentar novamente?');
       convo.end();
    });
  }
};

const bot = new BootBot({
  accessToken: process.env.FB_ACCESS_TOKEN,
  verifyToken: process.env.FB_VERIFY_TOKEN,
  appSecret: process.env.FB_APP_SECRET
});

const env = process.env.NODE_ENV || 'development';
if (env === 'development') {
   process.env.PORT = 8000;
}

bot.setGreetingText('Você gostaria de colaborar com notícias?');

bot.setGetStartedButton((payload, chat) => {
  console.log('GET_STARTED');
  chat.sendGenericTemplate([{
    "title": "Olá, eu sou Reporterzito! Muito prazer. Como posso lhe ajudar?",
    "image_url": "",
    "subtitle": "Para interagir comigo clique no ícone do menu",
    "buttons": [{
      "type": "postback",
      "title": "Enviar uma notícia",
      "payload": "MENU_SEND"
    }]
  }]
  );
});

bot.hear(['Olá', 'Oi', 'começar', 'comecar'], (payload, chat) => {
  chat.getUserProfile().then((user) => {
    chat.say({
      text: `Olá ${user.first_name}, você gostaria de colaborar com uma reportagem?`,
      quickReplies: [
        { content_type: 'text', title: 'Sim', payload: 'MENU_SEND' },
        { content_type: 'text', title: 'Não', payload: 'START_NO' },
      ]
    }, { typing: true });
  });
});

bot.on('quick_reply:MENU_SEND', (payload, chat) => {
  bot.emit('postback:MENU_SEND', payload, chat);
});

bot.on('postback:MENU_SEND', (payload, chat) => {
  console.log(JSON.stringify(payload, null, 2));
  const userId = payload.sender.id;
  const found = USERS.find(elem => elem._id === userId);
  if (!found) {
    chat.conversation((convo) => {
      convo.ask('Digite a localização:', findLocation);
    });
  } else {
    bot.emit('quick_reply:ADDRESS_YES', payload, chat);
  }
});

bot.on('attachment', (payload, chat) => {
  chat.getUserProfile().then((user) => {
    var app = new Clarifai.App(
      process.env.CLARIFAI_SECRET,
      process.env.CLARIFAI_CLIENT
    );

    app.models.predict('aaa03c23b3724a16a56b629203edc62c',
    payload.message.attachments[0].payload.url)
    .then(function(response) {
      // console.log(JSON.stringify(response, null, 2));
      console.log(JSON.stringify(user, null, 2));

        var myObj = {
          user: {
            id: payload.sender.id,
            name: user.first_name + " " + user.last_name
          },
          news: {
            content: "",
            image: payload.message.attachments[0].payload.url
          },
          tags: response.outputs[0].data.concepts.filter((el) => {
            if (el.value > 0.9) {
              return true
            }
          }).map((el) => { return { name: el.name, value: el.value }})
        };
        console.log(myObj);
        fetch('http://ddb7351b.ngrok.io/api/create_news', { 
          method: 'POST',
          body: JSON.stringify(myObj),
          headers: { 'Content-Type': 'application/json' }, 
        })
        .then(res => console.log(res.json()))
        .then(json => console.log(json));
      },
      function(err) {
        // there was an error
      }
    );
  });
});

bot.start(process.env.PORT);