
export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response("ANDROID ZONE BOT IS RUNNING!");
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (!env.BOT_TOKEN) {
      return new Response("BOT_TOKEN belum dikonfigurasi", { status: 500 });
    }

    try {
      const update = await request.json();

      if (update.message) {
        const chatId = update.message.chat.id;
        const msg = (update.message.text || "").trim();

        if (msg === "/start") {
          await send(env, chatId,
            "ANDROID ZONE BOT\n\n" +
            "Selamat datang!\n" +
            "Pusat informasi aplikasi dan teknologi Android.\n\n" +
            "Silakan pilih menu:",
            {
              inline_keyboard: [
                [
                  { text: "Cari Aplikasi", callback_data: "search" },
                  { text: "Kategori Apps", callback_data: "categories" }
                ],
                [
                  { text: "Aplikasi Terbaru", callback_data: "latest" },
                  { text: "Bantuan", callback_data: "help" }
                ],
                ...(env.CHANNEL_URL ? [[
                  { text: "Channel Android Zone", url: env.CHANNEL_URL }
                ]] : [])
              ]
            }
          );
        } else if (msg === "/help") {
          await send(env, chatId,
            "BANTUAN ANDROID ZONE\n\n" +
            "/start - Menu utama\n" +
            "/help - Bantuan"
          );
        } else {
          await send(env, chatId,
            "Gunakan /start untuk membuka menu Android Zone."
          );
        }
      }

      if (update.callback_query) {
        const q = update.callback_query;

        await telegram(env, "answerCallbackQuery", {
          callback_query_id: q.id
        });

        const menus = {
          search: "PENCARIAN APLIKASI\n\nDatabase pencarian akan dihubungkan pada tahap berikutnya.",
          categories: "KATEGORI APLIKASI\n\nTools & Utilities\nPhotography\nProductivity\nCustomization\nMultimedia\nSecurity",
          latest: "APLIKASI TERBARU\n\nDatabase aplikasi terbaru akan segera dihubungkan.",
          help: "Gunakan /start untuk membuka menu utama."
        };

        await send(env, q.message.chat.id,
          menus[q.data] || "Menu tidak tersedia."
        );
      }

      return new Response("OK");

    } catch (error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};

async function send(env, chatId, text, keyboard = null) {
  const payload = {
    chat_id: chatId,
    text
  };

  if (keyboard) {
    payload.reply_markup = keyboard;
  }

  return telegram(env, "sendMessage", payload);
}

async function telegram(env, method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.description || "Telegram API error");
  }

  return result;
}
