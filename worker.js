
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
        const message = update.message;
        const chatId = message.chat.id;
        const senderId = String(message.from?.id || "");
        const adminId = String(env.ADMIN_ID || "");
        const msg = (message.text || "").trim();

        // =====================================
        // DATABASE CHECK
        // =====================================
        if (!env.DB) {
          await send(env, chatId, "❌ Database D1 belum terhubung.");
          return new Response("OK");
        }

        // =====================================
        // BATALKAN UPLOAD
        // =====================================
        if (senderId === adminId && msg === "/cancel") {
          await env.DB.prepare(
            "DELETE FROM pending_uploads WHERE telegram_id = ?"
          ).bind(senderId).run();

          await send(env, chatId, "❌ Proses upload berhasil dibatalkan.");
          return new Response("OK");
        }

        // =====================================
        // UPLOAD APK KHUSUS ADMIN
        // =====================================
        if (message.document) {
          const doc = message.document;
          const fileName = doc.file_name || "aplikasi.apk";

          if (senderId !== adminId) {
            await send(env, chatId,
              "⛔ Fitur upload APK hanya tersedia untuk admin."
            );

          } else if (!/\.apk$/i.test(fileName)) {
            await send(env, chatId,
              "❌ File ditolak. Silakan kirim file APK."
            );

          } else {
            try {
              // Hapus sesi upload lama milik admin
              await env.DB.prepare(
                "DELETE FROM pending_uploads WHERE telegram_id = ?"
              ).bind(senderId).run();

              await env.DB.prepare(
                `INSERT INTO pending_uploads
                (telegram_id, apk_file_id, apk_file_name,
                 file_size, current_step)
                 VALUES (?, ?, ?, ?, ?)`
              ).bind(
                senderId,
                doc.file_id,
                fileName,
                doc.file_size || null,
                "name"
              ).run();

              await send(
                env,
                chatId,
                "📦 APK DITERIMA!\n\n" +
                "Nama file: " + fileName + "\n\n" +
                "Sekarang masukkan NAMA APLIKASI.\n\n" +
                "Contoh: NotiMe Video\n\n" +
                "Ketik /cancel untuk membatalkan."
              );

            } catch (error) {
              console.error("Pending upload error:", error);
              await send(env, chatId, "❌ Gagal memulai proses upload.");
            }
          }

        // =====================================
        // PROSES PENGISIAN DATA ADMIN
        // =====================================
        } else if (senderId === adminId) {
          try {
            const pending = await env.DB.prepare(
              `SELECT * FROM pending_uploads
               WHERE telegram_id = ?
               ORDER BY id DESC LIMIT 1`
            ).bind(senderId).first();

            if (pending) {

              // NAMA APLIKASI
              if (pending.current_step === "name") {
                if (!msg || msg.startsWith("/")) {
                  await send(env, chatId,
                    "❌ Masukkan nama aplikasi yang valid."
                  );
                } else {
                  await env.DB.prepare(
                    `UPDATE pending_uploads
                     SET app_name = ?, current_step = 'version'
                     WHERE id = ?`
                  ).bind(msg, pending.id).run();

                  await send(env, chatId,
                    "✅ Nama aplikasi: " + msg +
                    "\n\nSekarang masukkan VERSI aplikasi.\n" +
                    "Contoh: 1.0.0"
                  );
                }

              // VERSI APLIKASI
              } else if (pending.current_step === "version") {
                if (!msg || msg.startsWith("/")) {
                  await send(env, chatId,
                    "❌ Masukkan versi aplikasi yang valid."
                  );
                } else {
                  await env.DB.prepare(
                    `UPDATE pending_uploads
                     SET version = ?, current_step = 'category'
                     WHERE id = ?`
                  ).bind(msg, pending.id).run();

                  await send(env, chatId,
                    "✅ Versi: " + msg +
                    "\n\nMasukkan KATEGORI aplikasi.\n\n" +
                    "Contoh:\n" +
                    "Tools & Utilities\n" +
                    "Photography\n" +
                    "Productivity\n" +
                    "Customization\n" +
                    "Multimedia\n" +
                    "Security"
                  );
                }

              // KATEGORI APLIKASI
              } else if (pending.current_step === "category") {
                if (!msg || msg.startsWith("/")) {
                  await send(env, chatId,
                    "❌ Masukkan kategori aplikasi yang valid."
                  );
                } else {
                  await env.DB.prepare(
                    `UPDATE pending_uploads
                     SET category = ?, current_step = 'description'
                     WHERE id = ?`
                  ).bind(msg, pending.id).run();

                  await send(env, chatId,
                    "✅ Kategori: " + msg +
                    "\n\nSekarang masukkan DESKRIPSI aplikasi."
                  );
                }

              // DESKRIPSI APLIKASI
              } else if (pending.current_step === "description") {
                if (!msg || msg.startsWith("/")) {
                  await send(env, chatId,
                    "❌ Masukkan deskripsi aplikasi yang valid."
                  );
                } else {
                  await env.DB.prepare(
                    `UPDATE pending_uploads
                     SET description = ?, current_step = 'icon'
                     WHERE id = ?`
                  ).bind(msg, pending.id).run();

                  await send(env, chatId,
                    "✅ Deskripsi berhasil disimpan.\n\n" +
                    "Sekarang kirim IKON aplikasi sebagai foto.\n\n" +
                    "Jika tidak ingin menggunakan ikon, ketik /skip."
                  );
                }

              // IKON APLIKASI
              } else if (pending.current_step === "icon") {
                if (message.photo && message.photo.length > 0) {
                  const photo = message.photo[message.photo.length - 1];

                  await env.DB.prepare(
                    `UPDATE pending_uploads
                     SET icon_file_id = ?
                     WHERE id = ?`
                  ).bind(photo.file_id, pending.id).run();

                  await finishUpload(env, chatId, pending.id);

                } else if (msg === "/skip") {
                  await finishUpload(env, chatId, pending.id);

                } else {
                  await send(env, chatId,
                    "❌ Kirim ikon dalam bentuk foto atau ketik /skip."
                  );
                }
              }

              return new Response("OK");
            }

          } catch (error) {
            console.error("Admin form error:", error);
            await send(env, chatId,
              "❌ Terjadi kesalahan saat mengisi data aplikasi."
            );
            return new Response("OK");
          }
        }

        // =====================================
        // MENU START
        // =====================================
        if (msg === "/start") {
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
                  (app.description || "Tidak ada deskripsi.");

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
            await send(env, chatId,
              "❌ Terjadi kesalahan saat mencari aplikasi."
            );
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

        // CARI APLIKASI
        if (q.data === "search") {
          await send(env, chatId,
            "🔎 PENCARIAN APLIKASI\n\n" +
            "Silakan ketik nama aplikasi yang ingin kamu cari."
          );
        }

        // DOWNLOAD APK
        else if (q.data && q.data.startsWith("download_")) {
          const appId = Number(q.data.replace("download_", ""));

          if (!Number.isInteger(appId) || appId <= 0) {
            await send(env, chatId, "❌ Permintaan download tidak valid.");
          } else {
            try {
              const app = await env.DB.prepare(
                `SELECT id, name, apk_key
                 FROM apps WHERE id = ?`
              ).bind(appId).first();

              if (!app || !app.apk_key) {
                await send(env, chatId, "❌ File APK tidak ditemukan.");
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
              await send(env, chatId,
                "❌ Gagal mengirim APK. Silakan coba kembali."
              );
            }
          }
        }

        // KATEGORI
        else if (q.data === "categories") {
          await send(env, chatId,
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

        // APLIKASI TERBARU
        else if (q.data === "latest") {
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

        // BANTUAN
        else if (q.data === "help") {
          await send(env, chatId,
            "ℹ️ BANTUAN ANDROID ZONE\n\n" +
            "Pilih Cari Aplikasi, lalu ketik nama aplikasi.\n" +
            "Tekan tombol Download APK untuk menerima file."
          );
        }
      }

      return new Response("OK");

    } catch (error) {
      console.error("Worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};

// =====================================
// SELESAIKAN UPLOAD
// =====================================
async function finishUpload(env, chatId, pendingId) {
  const pending = await env.DB.prepare(
    "SELECT * FROM pending_uploads WHERE id = ?"
  ).bind(pendingId).first();

  if (!pending) {
    await send(env, chatId, "❌ Data upload tidak ditemukan.");
    return;
  }

  try {
    const result = await env.DB.prepare(
      `INSERT INTO apps
      (name, version, description, category, apk_key,
       icon_key, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      pending.app_name,
      pending.version,
      pending.description,
      pending.category,
      pending.apk_file_id,
      pending.icon_file_id || null,
      pending.file_size,
      pending.telegram_id
    ).run();

    const appId = result.meta?.last_row_id;

    await env.DB.prepare(
      `INSERT INTO upload_logs
      (app_id, uploaded_by, source, status)
       VALUES (?, ?, ?, ?)`
    ).bind(
      appId || null,
      pending.telegram_id,
      "Telegram",
      "success"
    ).run();

    await env.DB.prepare(
      "DELETE FROM pending_uploads WHERE id = ?"
    ).bind(pendingId).run();

    const sizeMB = pending.file_size
      ? (pending.file_size / (1024 * 1024)).toFixed(2) + " MB"
      : "Tidak diketahui";

    await send(
      env,
      chatId,
      "🎉 UPLOAD APK BERHASIL!\n\n" +
      "📱 Nama: " + pending.app_name + "\n" +
      "🔢 Versi: " + pending.version + "\n" +
      "📂 Kategori: " + pending.category + "\n" +
      "📦 Ukuran: " + sizeMB + "\n" +
      "🖼 Ikon: " + (pending.icon_file_id ? "Tersimpan" : "Tidak digunakan") +
      "\n\n✅ Aplikasi sudah masuk ke database Android Zone dan siap diunduh."
    );

  } catch (error) {
    console.error("Finish upload error:", error);
    await send(env, chatId,
      "❌ Gagal menyimpan aplikasi. Data upload sementara masih dipertahankan."
    );
  }
}

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
