
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

      // =====================================
      // PESAN MASUK
      // =====================================
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
              "⛔ Fitur upload APK hanya tersedia untuk admin."
            );

          } else if (!/\.apk$/i.test(fileName)) {
            await send(
              env,
              chatId,
              "❌ File ditolak. Silakan kirim file APK."
            );

          } else if (!env.DB) {
            await send(env, chatId, "❌ Database D1 belum terhubung.");

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
              console.error("Upload error:", error);

              await send(
                env,
                chatId,
                "❌ Gagal menyimpan APK ke database."
              );
            }
          }

        // =====================================
        // MENU START
        // =====================================
        } else if (msg === "/start") {
          await send(
            env,
            chatId,
            "ANDROID ZONE BOT\n\n" +
            "Selamat datang di Android Zone!\n" +
            "Pusat informasi aplikasi dan teknologi Android.\n\n" +
            "Silakan pilih menu:",
            {
              inline_keyboard: [
                [
                  { text: "🔎 Cari Aplikasi", callback_data: "search" },
                  { text: "📂 Kategori Apps", callback_data: "categories" }
                ],
                [
                  { text: "🆕 Aplikasi Terbaru", callback_data: "latest" },
                  { text: "ℹ️ Bantuan", callback_data: "help" }
                ],
                ...(env.CHANNEL_URL
                  ? [[{
                      text: "Channel Android Zone",
                      url: env.CHANNEL_URL
                    }]]
                  : [])
              ]
            }
          );

        // =====================================
        // BANTUAN
        // =====================================
        } else if (msg === "/help") {
          await send(
            env,
            chatId,
            "BANTUAN ANDROID ZONE\n\n" +
            "/start - Menu utama\n" +
            "/help - Bantuan\n\n" +
            "Gunakan menu Cari Aplikasi untuk mencari APK.\n" +
            "Admin dapat mengirim file APK langsung ke bot."
          );

        // =====================================
        // PENCARIAN APLIKASI
        // =====================================
        } else if (msg.length > 0) {
          if (!env.DB) {
            await send(env, chatId, "❌ Database belum terhubung.");

          } else {
            try {
              const keyword = "%" + msg + "%";

              const result = await env.DB.prepare(
                `SELECT id, name, package_name, version,
                        description, category, file_size
                 FROM apps
                 WHERE name LIKE ?
                    OR package_name LIKE ?
                    OR category LIKE ?
                 ORDER BY created_at DESC
                 LIMIT 10`
              ).bind(keyword, keyword, keyword).all();

              const apps = result.results || [];

              if (apps.length === 0) {
                await send(
                  env,
                  chatId,
                  "🔎 APLIKASI TIDAK DITEMUKAN\n\n" +
                  "Kata kunci: " + msg + "\n\n" +
                  "Coba gunakan nama aplikasi yang berbeda."
                );

              } else {
                for (const app of apps) {
                  const size = app.file_size
                    ? (app.file_size / (1024 * 1024)).toFixed(2) + " MB"
                    : "Tidak diketahui";

                  const caption =
                    "📱 " + app.name + "\n\n" +
                    "Kategori: " + (app.category || "Uncategorized") + "\n" +
                    "Versi: " + (app.version || "Belum tersedia") + "\n" +
                    "Package: " + (app.package_name || "Belum tersedia") + "\n" +
                    "Ukuran: " + size + "\n\n" +
                    (app.description || "Tidak ada deskripsi.") ;

                  await send(
                    env,
                    chatId,
                    caption,
                    {
                      inline_keyboard: [[
                        {
                          text: "⬇️ Download APK",
                          callback_data: "download_" + app.id
                        }
                      ]]
                    }
                  );
                }
              }

            } catch (error) {
              console.error("Search error:", error);

              await send(
                env,
                chatId,
                "❌ Terjadi kesalahan saat mencari aplikasi."
              );
            }
          }
        }
      }

      // =====================================
      // TOMBOL CALLBACK
      // =====================================
      if (update.callback_query) {
        const q = update.callback_query;
        const chatId = q.message?.chat?.id;

        await telegram(env, "answerCallbackQuery", {
          callback_query_id: q.id
        });

        // =====================================
        // TOMBOL CARI APLIKASI
        // =====================================
        if (q.data === "search") {
          await send(
            env,
            chatId,
            "🔎 PENCARIAN APLIKASI\n\n" +
            "Silakan ketik nama aplikasi yang ingin kamu cari."
          );
        }

        // =====================================
        // DOWNLOAD APK
        // =====================================
        else if (q.data.startsWith("download_")) {
          const appId = Number(q.data.replace("download_", ""));

          if (!Number.isInteger(appId) || appId <= 0 || !env.DB) {
            await send(env, chatId, "❌ Permintaan download tidak valid.");
          } else {
            try {
              const app = await env.DB.prepare(
                `SELECT id, name, apk_key
                 FROM apps
                 WHERE id = ?`
              ).bind(appId).first();

              if (!app || !app.apk_key) {
                await send(
                  env,
                  chatId,
                  "❌ File APK tidak ditemukan."
                );

              } else {
                await telegram(env, "sendDocument", {
                  chat_id: chatId,
                  document: app.apk_key,
                  caption:
                    "📦 " + app.name + "\n\n" +
                    "Terima kasih telah menggunakan Android Zone."
                });

                await env.DB.prepare(
                  `UPDATE apps
                   SET download_count = download_count + 1
                   WHERE id = ?`
                ).bind(appId).run();
              }

            } catch (error) {
              console.error("Download error:", error);

              await send(
                env,
                chatId,
                "❌ Gagal mengirim APK.\n\n" +
                "Silakan coba kembali beberapa saat lagi."
              );
            }
          }
        }

        // =====================================
        // MENU KATEGORI
        // =====================================
        else if (q.data === "categories") {
          await send(
            env,
            chatId,
            "📂 KATEGORI APLIKASI\n\n" +
            "Tools & Utilities\n" +
            "Photography\n" +
            "Productivity\n" +
            "Customization\n" +
            "Multimedia\n" +
            "Security\n\n" +
            "Kamu juga bisa mencari nama kategori melalui menu pencarian."
          );
        }

        // =====================================
        // APLIKASI TERBARU
        // =====================================
        else if (q.data === "latest") {
          if (!env.DB) {
            await send(env, chatId, "❌ Database belum terhubung.");
          } else {
            try {
              const result = await env.DB.prepare(
                `SELECT id, name, category
                 FROM apps
                 ORDER BY created_at DESC
                 LIMIT 10`
              ).all();

              const apps = result.results || [];

              if (apps.length === 0) {
                await send(env, chatId, "Belum ada aplikasi tersedia.");
              } else {
                for (const app of apps) {
                  await send(
                    env,
                    chatId,
                    "📱 " + app.name + "\n" +
                    "Kategori: " + (app.category || "Uncategorized"),
                    {
                      inline_keyboard: [[
                        {
                          text: "⬇️ Download APK",
                          callback_data: "download_" + app.id
                        }
                      ]]
                    }
                  );
                }
              }
            } catch (error) {
              console.error("Latest error:", error);
              await send(env, chatId, "❌ Gagal memuat aplikasi terbaru.");
            }
          }
        }

        // =====================================
        // BANTUAN
        // =====================================
        else if (q.data === "help") {
          await send(
            env,
            chatId,
            "ℹ️ BANTUAN ANDROID ZONE\n\n" +
            "Pilih Cari Aplikasi, lalu ketik nama aplikasi.\n" +
            "Tekan tombol Download APK untuk menerima file."
          );
        }
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
