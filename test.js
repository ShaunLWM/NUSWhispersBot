/**
 * This example demonstrates using polling.
 * It also demonstrates how you would process and send messages.
 */
process.env.NTBA_FIX_319 = 1;

let emojis = ["👍", "♥️", "😂", "😡", "😲", "😭"];
let confessionLikes = new Array(emojis.length).fill(0);

function createKeyboard() {
	let kb = emojis.map((e, i) => {
		if (confessionLikes[i] === 0)
			return { text: e, callback_data: i };
		return { text: `${e} ${confessionLikes[i]}`, callback_data: i };
	})

	console.log(kb);
	console.log([kb.slice(0, 3), kb.slice(3, 6)]);
	return [kb];
}

let currentKeyboard = createKeyboard();
// console.log(currentKeyboard);
const TOKEN = "";
const TelegramBot = require('node-telegram-bot-api');
const options = {
	polling: true
};

const bot = new TelegramBot(TOKEN, options);

// Matches /love
bot.onText(/\/love/, msg => {
	const opts = {
		// reply_to_message_id: msg.message_id,
		reply_markup: JSON.stringify({
			inline_keyboard: currentKeyboard
		})
	};

	return bot.sendMessage(msg.chat.id, 'Do you love me?', opts);
});


// Matches /echo [whatever]
bot.onText(/\/echo (.+)/, function onEchoText(msg, match) {
	const resp = match[1];
	bot.sendMessage(msg.chat.id, resp);
});


// Matches /editable
bot.onText(/\/editable/, function onEditableText(msg) {
	const opts = {
		reply_markup: {
			inline_keyboard: [
				[
					{
						text: 'Edit Text',
						// we shall check for this value when we listen
						// for "callback_query"
						callback_data: 'edit'
					}
				]
			]
		}
	};
	bot.sendMessage(msg.from.id, 'Original Text', opts);
});


// Handle callback queries
bot.on('callback_query', msg => {
	let text = msg["message"]["text"];
	const data = parseInt(msg["data"]);
	confessionLikes[data]++;
	const opts = {
		chat_id: msg.message.chat.id,
		message_id: msg.message.message_id,
		reply_markup: JSON.stringify({
			inline_keyboard: createKeyboard()
		})
	};

	bot.editMessageText(text, opts);
	return bot.answerCallbackQuery(msg.id);
});

bot.on("polling_error", (err) => console.log(err));
bot.on("error", error => console.log(error))
bot.on("message", data => {
	bot.sendMessage("@Shauntestchannel", "LMao", {
		"disable_web_page_preview": true,
		reply_markup: JSON.stringify({
			inline_keyboard: createKeyboard()
		})
	})
	console.log(data);
})