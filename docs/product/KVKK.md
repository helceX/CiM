# KVKK (6698) — uyum durumu, veri envanteri ve yapılacaklar

> **Durum: 9 Ekim 2026. Taslaktır, hukuki görüş değildir.** Bu belge ürünün kişisel veri akışını çıkarır;
> yazılımda yapılanları ve şirket yetkilisinin (sahibin) yapması gerekenleri ayırır. Yayımlanan metinlerin
> (Gizlilik / KVKK Aydınlatma Metni, Çerez Politikası, Hizmet Sağlayıcılar) son hâli için bir KVKK
> danışmanı veya avukat incelemesi gerekir. Mevzuat bilgilerinin bir kısmı ikincil kaynaklardan derlendi;
> "teyit edin" denen yerler gerçekten teyit edilmelidir.

## 1. Kısa durum

| Konu | Durum |
|---|---|
| Aydınlatma metni (md. 10), TR + EN | **Yayında** (`/privacy`). Tebliğin istediği unsurlar var; veri sorumlusunun unvan/adres/MERSİS/KEP alanları §10'daki ortam değişkenleri girilince görünür. |
| Çerez politikası | **Yayında** (`/cookies`). Yalnızca zorunlu ve işlevsel çerezler; analitik/reklam/takip yok → onay bannerı gerekmiyor. |
| Hizmet sağlayıcılar ve yurt dışı aktarım | **Yayında** (`/subprocessors`). |
| Hesap silme | Var: kişisel bilgiler geri döndürülemez biçimde anonimleştirilir, oturumlar kapanır. |
| Organizasyon silme | **Yeni:** erişim hemen kapanır; 30 gün sonra her şey (bahsetmeler, raporlar, yorumlar, arşiv dosyaları) kalıcı silinir ve silme kaydı tutulur (§9). Eskiden "silindi" işareti vardı, veri hiç gitmiyordu. |
| Oturum / tek kullanımlık anahtar temizliği | **Yeni:** süresi dolduktan veya kullanıldıktan 30 gün sonra silinir (oturumlar IP ve tarayıcı bilgisi taşır). |
| Hesap verisini dışa aktarma | Var (`/api/account/export`; yalnızca hesap verisi). |
| İlgili kişi başvurusu (md. 11, 13) | Kanal: e-posta (+ KEP). **Başvuru formu ve takip ekranı yok** (§8). |
| VERBİS kaydı | Büyük olasılıkla muaf; **teyit edin** (§7). |
| Yurt dışına aktarım (md. 9) | **Açık — sahibin işi** (§6). En çok iş çıkaran madde. |
| Müşteri tarafı veri işleme eki | İskelet var (§12); son hâlini avukat yazmalı. |
| Veri ihlali prosedürü | Yazıldı (§11); tatbikat yapılmadı. |

## 2. Roller: Mediaory kim?

KVKK'da **veri sorumlusu** verinin işlenme amaçlarını ve araçlarını belirler; **veri işleyen** onun adına işler.

| Veri | Mediaory'nin rolü | Not |
|---|---|---|
| Hesap, organizasyon üyeliği, fatura profili, oturum/güvenlik kayıtları, kullanım sayaçları, form başvuruları | **Veri sorumlusu** | Kendi hizmetini sunmak için. |
| Müşterinin çalışma alanı içeriği (anahtar kelimeler, yorumlar, atamalar, raporlar) | **Veri işleyen** (müşteri veri sorumlusu) | Müşteri kişisel veri koyarsa (ör. iş arkadaşlarının adı). Veri işleme eki gerekir (§12). |
| Herkese açık kaynaklardaki içerik (başlık, kısa özet, yazar adı) | **Belirsiz — avukata sorulacak** | Dizinleme araçlarını biz seçiyoruz (veri sorumlusu gibi), neyin izleneceğini müşteri seçiyor. Ortak veri sorumluluğu da düşünülebilir. |

Kaynaklar: KVKK'nın "Veri Sorumlusu ve Veri İşleyen" rehberi (Haziran 2025) bu ayrımı ve sözleşmede sıfatın
açıkça yazılması gerektiğini vurgular; bulut/SaaS sağlayıcısı genellikle veri işleyendir, ama kendi amaçlarını
belirliyorsa veri sorumlusu da olabilir.

## 3. Veri envanteri

| Veri grubu | İçerik | Amaç | Hukuki sebep (KVKK m. 5) | Alıcılar | Saklama |
|---|---|---|---|---|---|
| Hesap | ad, soyad, e-posta, unvan, dil, saat dilimi, parola (scrypt, tuzlu) | Üyelik, kimlik doğrulama, hizmet | Sözleşme (5/2-c) | Railway (barındırma), Resend (e-posta) | Hesap süresince; silinince anonimleştirme |
| Organizasyon ve fatura | organizasyon adı, rol; fatura profili: unvan, vergi dairesi/no, adres, e-posta | Hizmet, fatura | Sözleşme (5/2-c), hukuki yükümlülük (5/2-ç) | Railway | Mevzuattaki süre (teyit edin) |
| Güvenlik / kullanım | oturum (IP, tarayıcı), denetim kayıtları, kullanım sayaçları, hata kayıtları | Güvenlik, kötüye kullanımı önleme, hata ayıklama | Meşru menfaat (5/2-f) | Railway | Oturum: bitişten 30 gün sonra silinir; denetim kayıtları organizasyonla birlikte |
| Çalışma alanı içeriği | anahtar kelimeler, uyarı kuralları, etiket, yorum, atama, rapor | Hizmet | Müşteri adına (veri işleyen) | Railway, Cloudflare R2 (arşiv) | Organizasyonun saklama ayarı / organizasyon silinene kadar + 30 gün |
| Bağlı sosyal hesap | OAuth erişim anahtarı (AES-256-GCM ile şifreli), hesap tanımlayıcısı | Bağlı hesap özelliği | Açık rıza (5/1), sözleşme | Google/YouTube, X | Bağlantı kaldırılana kadar |
| Form başvuruları | iletişim, içerik kaldırma: ad, e-posta, mesaj | Talebi yürütmek | Meşru menfaat, hakkın tesisi (5/2-e,f) | Railway, Resend (yönetici bildirimi) | Talep ve ispat için gereken süre |
| Herkese açık kaynak içeriği | başlık, bağlantı, yayın zamanı, kamuya açık yazar adı, ≤200 karakter özet, kelime parmak izi | Medya izleme | Meşru menfaat (5/2-f), veri asgari tutulur | — | Eşleşmeyen: 14 gün; eşleşen: müşterinin saklama ayarı |

Çerezler: `cim_session` (zorunlu, ≤30 gün), `NEXT_LOCALE` (dil, 1 yıl), `localStorage: mediaory-panel-theme`
(tema). Analitik, reklam, üçüncü taraf çerezi yok. Cloudflare Turnstile **açıksa** kayıt, parola sıfırlama ve
içerik kaldırma formlarında Cloudflare'ın betiği yüklenir.

## 4. Hukuki sebepler ve avukata sorulacaklar

1. **Haberlerde adı geçen kişiler.** Başlık ve kısa özette kişi adları geçer. Dayanak olarak meşru menfaat
   (5/2-f) yazdık; bunun denge testi (ilgili kişinin hakları karşısında) yazılı yapılmalı. Veriyi asgari tuttuk
   (başlık, bağlantı, 200 karakter, tam metin yok) ve kaldırma kanalı var. **Soru:** bu yeterli mi?
2. **Özel nitelikli veri.** Basın haberleri sağlık, siyasi görüş, ceza mahkûmiyeti gibi özel nitelikli verilere
   değinebilir (md. 6; 2024'te 7499 sayılı Kanun'la yeniden düzenlendi). Bunları ayıklamıyoruz. **Soru:** hangi
   koşullar altında dizinleme sürdürülebilir; hangi alt gruba kaldırma varsayılan olmalı?
3. **Rol belirlemesi** (§2, üçüncü satır).
4. **Müşteri çalışma alanı** içeriğinde veri işleyen olma ve veri işleme eki.
5. İfade özgürlüğü kapsamında işleme istisnası (md. 28/1-c; madde numarasını teyit edin) bir medya izleme hizmeti için geçerli sayılır mı?

## 5. Aydınlatma (md. 10)

Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ'e göre metinde en az:
veri sorumlusunun (ve varsa temsilcisinin) kimliği; işleme amacı; kimlere ve hangi amaçla aktarılabileceği;
toplama yöntemi ve hukuki sebebi; md. 11'deki haklar bulunur. Metin veriler toplanırken, açık ve sade dille
verilmelidir; açık rıza metniyle aynı metinde sunulmaz.

Yapılanlar: `/privacy` (TR/EN) bu unsurların hepsini içerir. Kayıt, davet kabulü ve içerik kaldırma formlarında
metne bağlantı verilir ("onay kutusu" değil, bilgilendirme).

**Eksik:** veri sorumlusunun unvanı, adresi, MERSİS ve vergi numarası, KEP adresi (§10).

## 6. Yurt dışına aktarım (md. 9) — açık madde

7499 sayılı Kanun'la değişen md. 9 (1 Haziran 2024'ten itibaren): yeterlilik kararı yoksa **uygun güvenceler**
gerekir; rutin aktarımlarda açık rıza tek başına dayanak olmaktan çıkmıştır (geçiş dönemi 1 Eylül 2024'te
bitti). Güvenceler arasında **Kurul'un standart sözleşmesi**, bağlayıcı şirket kuralları ve Kurul onaylı
taahhütname vardır. Standart sözleşme imzalandıktan sonra **5 iş günü içinde Kurum'a bildirilir**; bildirim
25 Ekim 2024'ten beri Kurum'un "Standart Sözleşme Bildirim Modülü" üzerinden yapılıyor.

Mediaory'nin tüm alt işleyenleri yurt dışındadır:

| Sağlayıcı | Ne için | Bölge (doldurun) | Güvence durumu |
|---|---|---|---|
| Railway | Uygulama, işçi, PostgreSQL, Redis | ? (Railway projesinin bölgesi) | Açık |
| Cloudflare (R2) | Haftalık arşiv dosyaları | ? (R2 jurisdiction/location) | Açık |
| Cloudflare (Turnstile) | Bot koruması (açıksa) | Küresel | Açık |
| Resend | Hizmet e-postaları | ? | Açık |
| Anthropic | Yapay zekâ (varsayılan kapalı) | ABD | Kapalıyken gerekmez; açılmadan önce çözülmeli |
| Google (YouTube), X | Yalnızca müşteri hesabını bağlarsa | — | Müşterinin kendi yetkisi; avukata sorulacak |

**Sahibin yapacağı:** (1) şirket tüzel kişiliği tamam olunca her sağlayıcı için standart sözleşmeyi (veri
sorumlusu → veri işleyen) imzalama yolunu avukatla belirleyin; büyük sağlayıcılar Kurul'un metnini
değiştirmeden imzalamayabilir, bu durumda taahhütname veya başka güvence gerekir; (2) imzadan sonra 5 iş günü
içinde bildirimi yapın; (3) bölgeleri bu tabloya yazın; (4) `/subprocessors` ve `/privacy` metinlerini gerçekle
karşılaştırın. **Bu madde tamamlanana kadar yayındaki "aktarımlar 9. maddeye uygun yapılır" cümlesi eksik
doğrudur** — avukatla sözünü netleştirin.

## 7. VERBİS

Kurul kararlarına göre (ikincil kaynaklardan; Kurul karar metinlerinden teyit edin): ana faaliyet konusu özel
nitelikli veri işlemek olmayan, **yıllık çalışan sayısı 50'den az ve yıllık mali bilanço toplamı 100 milyon
TL'den az** veri sorumluları VERBİS'e kayıt yükümlülüğünden muaftır (2023/1154 sayılı karar; 2025/2393'te
bilanço bilgisi olmayanlar için yalnızca çalışan sayısı ölçütünün esas alındığı bildirilmektedir). Mediaory
mevcut hâliyle büyük olasılıkla muaf; ama **muafiyet yalnızca sicile kayıt yükümlülüğünü kaldırır**, diğer
yükümlülükler (aydınlatma, güvenlik, başvuru yanıtlama, ihlal bildirimi) aynen sürer. Eşik aşılırsa süre
sınırı vardır. Mali müşavir/avukatla her yıl yeniden kontrol edin.

## 8. İlgili kişi başvuruları (md. 11, 13)

- Başvuru yazılı veya KEP, güvenli elektronik imza ya da veri sorumlusuna daha önce bildirilmiş e-posta ile
  yapılır; **en geç 30 gün içinde ve ücretsiz** yanıtlanır. Kimlik doğrulaması yapılmalı.
- Şimdi: `hello@mediaory.io` (`PRIVACY_CONTACT_EMAIL` ile değişir). Müşteriler hesap/organizasyon
  silme ve dışa aktarmayı Ayarlar'dan kendileri yapar.
- **Boşluk:** başvuru formu, kayıt ve 30 günlük süre takibi yok. Önerilen: `takedown_requests` benzeri bir
  `privacy_requests` tablosu, `/privacy-request` formu (Turnstile + oran sınırı) ve Admin'de açık talepler
  listesi + süre uyarısı. (İstenirse yapılır.)
- Haberde adı geçen kişinin kaldırma talebi: ilgili haberin bağlantısı alınır ve o makale ile ona bağlı bahsetmeler
  silinir. **Bunun için bir Admin aracı yok**; şimdilik yönetici veritabanından siler. Öneri: Admin'e "bu bağlantıyı
  dizinden kaldır" aracı (§13, 5. madde).

## 9. Saklama ve imha

| Veri | Süre | Nasıl uygulanır |
|---|---|---|
| Eşleşmeyen haberler | 14 gün (`ARTICLE_CACHE_DAYS`; disk dolarken kısalır) | `prune-articles` işi, 6 saatte bir |
| Eşleşen haberler (bahsetmeler) | Organizasyonun saklama ayarı (Ayarlar → Privacy) | `enforce-retention` işi, günlük |
| Oturumlar ve tek kullanımlık anahtarlar | Bitişten/kullanımdan 30 gün sonra silinir | **`purge-privacy` işi, günlük 09:00** |
| Silinen organizasyon | 30 gün sonra kalıcı silinir (`ORG_ERASE_DAYS`, 7–365) | **`purge-privacy` işi**; önce R2 arşiv dosyaları, sonra veritabanı; silme `erasure_log`'a yazılır |
| Silinen hesap | Hemen anonimleştirilir (satır kalır, kişisel alanlar silinir) | `deleteUserAccount` |
| Fatura/muhasebe kayıtları | Mevzuattaki süre | Fatura özelliği henüz yok |

Silme kayıtları: "Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik"
silme işlemlerinin kaydının tutulmasını bekler (süreyi teyit edin; en az üç yıl diye biliyoruz). `erasure_log`
yalnızca kimlik ve sayılar tutar, kişisel veri tutmaz; organizasyon silinse de kalır.

Not: `purge-privacy`, R2 yapılandırılmamışsa ve organizasyonun arşiv dosyası varsa o organizasyonu **silmez**,
sonraki çalışmaya bırakır (yarım silme olmasın). Admin → Jobs'ta `purge_privacy` kuyruğu görünür.

## 10. Veri sorumlusu bilgileri (sahibin dolduracakları)

Web servisinin Railway Variables bölümüne (yalnızca web; anahtar değil, kamuya açık şirket bilgisi):

| Değişken | Örnek |
|---|---|
| `LEGAL_ENTITY_NAME` | Ticaret unvanı (ör. "… Teknoloji Anonim Şirketi") |
| `LEGAL_ENTITY_ADDRESS` | Tebligata elverişli adres |
| `LEGAL_ENTITY_MERSIS` | MERSİS numarası |
| `LEGAL_ENTITY_TAX_ID` | Vergi dairesi ve numarası |
| `LEGAL_ENTITY_KEP` | Kayıtlı elektronik posta adresi |
| `PRIVACY_CONTACT_EMAIL` | Gizlilik başvurularının e-postası (varsayılan `hello@mediaory.io`) |

Boş bırakılan alan metinde **görünmez** (yer tutucu gösterilmez). Hangi şirket Mediaory'yi satacak sorusu
henüz açık (`BILLING_DECISION.md`); önce o netleşmeli.

## 11. Veri güvenliği ve ihlal prosedürü

Alınan tedbirler (kodda): HTTPS (Railway), scrypt ile tuzlu parola, sunucuda doğrulanan iptal edilebilir
oturum, bağlı hesap anahtarlarının AES-256-GCM ile saklanması, rol tabanlı erişim ve her istekte organizasyon
denetimi, denetim kaydı, istek sınırlama, SSRF korumalı çekme, CSRF kontrolü.

**İhlal prosedürü (taslak):** (1) fark eden kişi hemen sahibe bildirir; (2) kapsam belirlenir: hangi veri,
kimler, ne zamandan beri; erişim kapatılır/anahtarlar yenilenir; (3) Kurul'a **en geç 72 saat** içinde bildirim
(Kurul kararı 2019/10 — teyit edin; Kurum'un ihlal bildirim formu); (4) etkilenen kişilere **en kısa sürede**, sade dille;
(5) olay, etkisi ve alınan önlemler yazılı kaydedilir. Yılda bir masa başı tatbikat önerilir.

## 12. Müşteri tarafı: veri işleme eki (iskelet)

Kurumsal müşteriler istediğinde imzalanacak ek şunları içermeli (avukat yazar): taraflar ve sıfatlar (müşteri
veri sorumlusu, Mediaory veri işleyen); işleme konusu, süresi, niteliği, veri türleri ve ilgili kişi grupları;
yalnızca yazılı talimatla işleme; gizlilik yükümlülüğü; veri güvenliği tedbirleri (§11); alt işleyenler
(`/subprocessors`) ve değişiklik bildirimi; yurt dışına aktarım güvencesi (§6); ilgili kişi başvurularında
yardım; ihlalde bildirim süresi; sözleşme bitiminde iade/silme; denetim hakkı.

## 13. Sahibin yapacakları (öncelik sırasıyla)

1. Şirket bilgilerini (§10) Railway Variables'a girin; hangi tüzel kişilik satış yapacak kararını netleştirin.
2. Bir KVKK avukatına/danışmanına bu belgeyi, `/privacy`, `/cookies`, `/subprocessors` sayfalarını gösterin;
   §4'teki soruları sorun.
3. Yurt dışına aktarım güvencelerini kurun ve bildirin (§6); bölgeleri doldurun.
4. VERBİS muafiyetini mali müşavirle teyit edin (§7).
5. İsterseniz başvuru formu ve takip ekranını yaptırın (§8).
6. Yapay zekâyı açmadan önce Anthropic için §6'yı tamamlayın.

## Kaynaklar

- [KVKK — Standart Sözleşme Bildirim Modülü Hakkında Kamuoyu Duyurusu](https://www.kvkk.gov.tr/Icerik/8043/Standart-Sozlesme-Bildirim-Modulu-Hakkinda-Kamuoyu-Duyurusu)
- [Erdem & Erdem — VERBİS kayıt yükümlülüğüne ilişkin istisna kriteri değiştirildi](https://www.erdem-erdem.av.tr/bilgi-bankasi/verbis-kayit-yukumlulugune-iliskin-istisna-kriteri-degistirildi)
- [Boğaziçi Bağımsız Denetim — 2026'da VERBİS'e kayıt zorunluluğunun kapsamı](https://www.bbdas.com.tr/2026-1-2026-yilinda-veri-sorumlulari-sicili-verbis-e-kayit-zorunlulugunun-kapsami-b-2916)
- [Erdem & Erdem — Yurt dışına kişisel veri aktarımı rehberi](https://www.erdem-erdem.av.tr/bilgi-bankasi/yurt-disina-kisisel-veri-aktarimi-rehberi-neleri-duzenliyor)
- [Mihçi Hukuk — KVKK aydınlatma yükümlülüğü](https://mihci.av.tr/kvkk-aydinlatma-yukumlulugu-nedir/)
- [AloMaliye — KVKK "Doğru Bilinen Yanlışlar" rehberi özeti](https://www.alomaliye.com/2025/03/26/kvkknin-dogru-bilinen-yanlislar-rehberi-ozeti/)
- Kurum: <https://www.kvkk.gov.tr>
