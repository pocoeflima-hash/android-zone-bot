
export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response("ANDROID ZONE BOT IS RUNNING!");
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (!env.BOT_TOKEN) {
      return new Response("BOT_TOKEN belum dikonfigurasi", {
        status: 500
      });
    }

    try {
      const update = await request.json();

      if (update.message) {
        const chatId = update.message.chat.id;
        const msg = (update.message.text || "").trim();

        // =====================================
        // UPLOAD APK KHUSUS ADMIN
        // =====================================
        if (update.message.document) {
          const senderId = String(update.message.from?.id || "");
          const adminId = String(env.ADMIN_ID || "");
          const doc = update.message.document;
          const fileName = doc.file_name || "aplikasi.apk";

          if (senderId !== adminId) {
            await send(
              env,
              chatId,
              "⛔ Maaf, fitur upload APK hanya tersedia untuk admin."
            );
          } else if (!/\.apk$/i.test(fileName)) {
            await send(
              env,
              chatId,
              "❌ File ditolak.\n\nSilakan kirim file dengan format APK."
            );
          } else if (!env.DB) {
            await send(
              env,
              chatId,
              "❌ Database D1 belum terhubung."
            );
          } else {
            try {
              await env.DB.prepare(
                `INSERT INTO apps
                (name, category, apk_key, file_size, uploaded_by)
                VALUES (?, ?, ?, ?, ?)`
              ).bind(
                fileName.replace(/\.apk$/i, ""),
                "Uncategorized",
                doc.file_id,
                doc.file_size || null,
                senderId
              ).run();

              await env.DB.prepare(
                `INSERT INTO upload_logs
                (uploaded_by, source, status)
                VALUES (?, ?, ?)`
              ).bind(
                senderId,
                "Telegram",
                "success"
              ).run();

              const sizeMB = doc.file_size
                ? (doc.file_size / (1024 * 1024)).toFixed(2) + " MB"
                : "Tidak diketahui";

              await send(
                env,
                chatId,
                "✅ APK BERHASIL DISIMPAN!\n\n" +
                "Nama: " + fileName + "\n" +
                "Ukuran: " + sizeMB + "\n" +
                "Kategori: Uncategorized\n\n" +
                "Data aplikasi sudah masuk ke database Android Zone."
              );
            } catch (error) {
              console.error("Upload APK error:", error);

              await send(
                env,
                chatId,
                "❌ Gagal menyimpan data APK ke database.\n\n" +
                "Periksa koneksi D1 dan struktur tabel database."
              );
            }
          }

        } else if (msg === "/start") {
          await send(
            env,
            chatId,
            "ANDROID ZONE BOT\n\n" +
            "Selamat datang!\n" +
            "Pusat informasi aplikasi dan teknologi Android.\n\n" +
            "Silakan pilih menu:",
            {
              inline_keyboard: [
                [
                  {
                    text: "Cari Aplikasi",
                    callback_data: "search"
                  },
                  {
                    text: "Kategori Apps",
                    callback_data: "categories"
                  }
                ],
                [
                  {
                    text: "Aplikasi Terbaru",
                    callback_data: "latest"
                  },
                  {
                    text: "Bantuan",
                    callback_data: "help"
                  }
                ],
                ...(env.CHANNEL_URL
                  ? [[
                      {
                        text: "Channel Android Zone",
                        url: env.CHANNEL_URL
                      }
                    ]]
                  : [])
              ]
            }
          );

        } else if (msg === "/help") {
          await send(
            env,
            chatId,
            "BANTUAN ANDROID ZONE\n\n" +
            "/start - Menu utama\n" +
            "/help - Bantuan\n\n" +
            "Admin dapat mengirim file APK langsung ke bot untuk menyimpannya ke database."
          );

        } else {
          await send(
            env,
            chatId,
            "Gunakan /start untuk membuka menu Android Zone."
          );
        }
      }

      // =====================================
      // CALLBACK MENU
      // =====================================
      if (update.callback_query) {
        const q = update.callback_query;

        await telegram(env, "answerCallbackQuery", {
          callback_query_id: q.id
        });

        const menus = {
          search:
            "PENCARIAN APLIKASI\n\n" +
            "Database pencarian akan dihubungkan pada tahap berikutnya.",

          categories:
            "KATEGORI APLIKASI\n\n" +
            "Tools & Utilities\n" +
            "Photography\n" +
            "Productivity\n" +
            "Customization\n" +
            "Multimedia\n" +
            "Security",

          latest:
            "APLIKASI TERBARU\n\n" +
            "Database aplikasi terbaru akan segera dihubungkan.",

          help:
            "Gunakan /start untuk membuka menu utama."
        };

        await send(
          env,
          q.message.chat.id,
          menus[q.data] || "Menu tidak tersedia."
        );
      }

      return new Response("OK");

    } catch (error) {
      console.error(error);

      return new Response("Internal Server Error", {
        status: 500
      });
    }
  }
};

// =====================================
// KIRIM PESAN TELEGRAM
// =====================================
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

// =====================================
// TELEGRAM API
// =====================================
async function telegram(env, method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();

  if (!result.ok) {
    throw new Error(
      result.description || "Telegram API error"
    );
  }

  return result;
}
