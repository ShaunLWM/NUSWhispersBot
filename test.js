/**
 * This example demonstrates using polling.
 * It also demonstrates how you would process and send messages.
 */
process.env.NTBA_FIX_319 = 1;

let emojis = ["👍", "♥️", "😂", "😡", "😲", "😭"];
let reactionIds = JSON.parse(require("fs").readFileSync("./reactions.json"));

function generateReaction(id) {
	return { id, response: new Array(emojis.length).fill([]) }
}

function createKeyboard(id) {
	let reactionIndex = reactionIds.findIndex(val => val.id === id);
	console.log("TCL: createKeyboard -> reactionIndex", reactionIndex)
	let opts = {};
	if (reactionIndex > -1)
		opts = reactionIds[reactionIndex];
	else {
		opts = generateReaction(id);
		reactionIds.push(opts);
	}

	console.log(opts);

	let keyboard = emojis.map((e, i) => {
		if (opts["response"][i].length === 0)
			return { text: e, callback_data: `${id}-${i}` };
		return { text: `${e} ${opts["response"][i].length}`, callback_data: `${id}-${i}` };
	});

	console.log(keyboard);
	return [keyboard];
}

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
			inline_keyboard: createKeyboard(74349)
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
	let text = msg["message"]["text"]; // telegram message itself
	let userId = msg["from"]["id"];
	let regexp = /(\d+)-(\d)/g;
	let match = regexp.exec(msg["data"]);
	if (match === null) return;
	//let confessionId = match[1];
	let confessionId = "74349";
	let reactionArrayId = parseInt(match[2]);
	console.log(confessionId, reactionArrayId);
	let reactionIndex = reactionIds.findIndex(val => val.id === confessionId);
	if (reactionIndex < 0) return bot.answerCallbackQuery(msg.id, "Wrong reaction? What?!");
	if (reactionIds[reactionIndex]["response"][reactionArrayId].includes(userId)) return bot.answerCallbackQuery(msg.id, "You have already reacted.");
	console.log("TCL: reactionIds[reactionIndex][\"response\"][reactionArrayId]", reactionIds[reactionIndex]["response"][reactionArrayId])
	reactionIds[reactionIndex]["response"][reactionArrayId].push(userId);
	console.log("TCL: reactionIds[reactionIndex][\"response\"][reactionArrayId]", reactionIds[reactionIndex]["response"][reactionArrayId])
	const opts = {
		chat_id: msg["message"]["chat"]["id"],
		message_id: msg["message"]["message_id"],
		disable_web_page_preview: true,
		reply_markup: JSON.stringify({
			inline_keyboard: createKeyboard(confessionId)
		})
	};

	// fs.writeFileSync("./reactions.json", JSON.stringify(reactionIds), { mode: 775 });
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