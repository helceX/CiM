export type BlogSection = { title: string; paragraphs: string[]; steps?: string[] };
export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  keywords: string[];
  answer: string;
  sections: BlogSection[];
  checklist: string[];
  faq: { question: string; answer: string }[];
  related: string[];
  cta: { title: string; body: string; href: string; label: string };
  sources?: { title: string; url: string }[];
};

export const BLOG_ORIGIN = "https://mediaory.io";
export const BLOG_DATE = "2026-10-11T09:00:00+03:00";
export const BLOG_AUTHOR = "Mediaory Editör Ekibi";
export const blogCategories = [
  "Medya takibi",
  "İletişim ölçümü",
  "Fırsat radarı",
  "Girişimcilik",
  "Dijital görünürlük",
];
const features = { href: "/features", label: "Mediaory özelliklerini incele" };
const opportunities = { href: "/opportunities", label: "Fırsat radarını aç" };
const amec = {
  title: "AMEC — Integrated Evaluation Framework",
  url: "https://amecorg.com/amecframework/",
};
const rss = {
  title: "RSS Advisory Board — RSS 2.0 Specification",
  url: "https://www.rssboard.org/rss-specification",
};
const google = {
  title: "Google Search Central — AI features and your website",
  url: "https://developers.google.com/search/docs/appearance/ai-features",
};

export const blogPosts: BlogPost[] = [
  {
    slug: "medya-takibi-nedir",
    title: "Medya takibi nedir? Markanız için ilk izleme planı",
    category: "Medya takibi",
    description:
      "Medya takibini haber saymaktan karar üretmeye taşıyın. Marka, rakip ve sektör için kaynak kapsamı, sorgu ve raporlama planını kurun.",
    keywords: ["medya takibi", "medya izleme", "marka haber takibi"],
    answer:
      "Medya takibi, bir marka, kişi veya konu hakkında yayımlanan içerikleri belirli kaynaklarda düzenli olarak izleme ve anlamlandırma sürecidir. İyi bir plan yalnızca kaç haber çıktığını değil, hangi gelişmenin hangi ekip için önemli olduğunu da gösterir.",
    sections: [
      {
        title: "Önce takip kararını tanımlayın",
        paragraphs: [
          "Bir iletişim ekibinin kriz riskini görmesi ile bir girişimin yeni yatırım çağrılarını keşfetmesi aynı izleme işi değildir. İlk adım, takip sonucunda verilecek kararı yazmaktır: açıklama hazırlamak, rakip hamlesini incelemek veya bir başvuru fırsatını değerlendirmek. Bu karar, kaynak ve anahtar kelime seçimini daraltır.",
          "Örneğin kurgusal Ada Teknoloji markası için üç ayrı takip açılabilir: şirket ve ürün adları, doğrudan rakipler, sektörün değişen ihtiyaçları. Hepsini tek bir geniş sorguda toplamak günlük listeyi büyütür; fakat hangi haberin neden geldiğini anlamayı zorlaştırır.",
        ],
      },
      {
        title: "Kaynak kapsamını açık tutun",
        paragraphs: [
          "İzleme kapsamını yayın türü, ülke, dil ve konu bakımından tarif edin. Türkiye'deki haberler ile başka ülkelerde yayımlanan Türkçe içerikler farklı kümeler olabilir. Dil ve ülke birbirinin yerine geçmez. Kaynağın RSS sunması da her eski içeriğinin akışta bulunacağı anlamına gelmez.",
          "Mediaory, erişilebilir kamuya açık kaynakların başlık, kısa özet ve bağlantılarını izleme iş akışına taşır. Bu yaklaşımı tüm internetin veya bütün sosyal ağların eksiksiz tarandığı varsayımıyla kullanmayın; karar verirken kapsam ve kaynağın son kontrol zamanı önemlidir.",
        ],
      },
      {
        title: "Günlük listeyi sorumluluğa dönüştürün",
        paragraphs: [
          "Gelen içerikleri bilgi, fırsat ve risk olarak ayırın. Her risk için sorumlu kişi, her fırsat için değerlendirme tarihi belirleyin. Günün sonunda yalnızca haber bağlantıları göndermek yerine, değişen durumu ve önerilen aksiyonu iki cümlede açıklayın.",
          "İlk hafta yanlış eşleşmeleri not edin; ikinci hafta sorguyu düzeltin. Aynı haberin farklı yayınlarda tekrarını ayırt etmek, haber adedi ile bağımsız gelişme adedini karıştırmayı önler. Kaynak kapsamı değiştiğinde de rapora kısa bir yöntem notu ekleyin.",
        ],
      },
    ],
    checklist: [
      "Takip sonucunda verilecek kararı yazın.",
      "Marka, rakip ve sektör sorgularını ayırın.",
      "Dil ve ülke kapsamını belirleyin.",
      "Risk ve fırsatlar için sorumlu atayın.",
    ],
    faq: [
      {
        question: "Medya takibi yalnızca büyük şirketler için mi?",
        answer:
          "Hayır. Küçük ekipler de dar bir marka ve sektör kapsamıyla başlayabilir. Takibin büyüklüğünü ekip kapasitesi ve karar ihtiyacı belirler.",
      },
      {
        question: "Haber sayısı tek başına başarı göstergesi mi?",
        answer:
          "Hayır. İçeriğin bağlamı, mesajı, kaynağı ve ekipte doğurduğu aksiyon birlikte değerlendirilmelidir.",
      },
    ],
    related: [
      "marka-takibi-anahtar-kelime",
      "rss-ile-haber-takibi",
      "medya-takip-raporu",
    ],
    cta: {
      ...features,
      title: "İlk marka takibinizi planlayın",
      body: "Mediaory'nin izleme, uyarı ve raporlama özelliklerini keşfederek ekibinize uygun bir kapsam oluşturun.",
    },
  },
  {
    slug: "marka-takibi-anahtar-kelime",
    title: "Marka takibinde anahtar kelime nasıl seçilir?",
    category: "Medya takibi",
    description:
      "Marka adı, ürün, yönetici ve rakip kelimelerini doğru bağlamla seçin. Yanlış eşleşmeleri azaltan pratik bir sorgu kontrol listesi.",
    keywords: ["marka takibi anahtar kelime", "medya takip sorgusu", "marka izleme"],
    answer:
      "Marka takibi için anahtar kelime seçimi; şirketin resmî adı, yaygın kısa adı, ürünleri ve ayırt edici bağlamını birlikte düşünmeyi gerektirir. En iyi başlangıç en geniş liste değil, neden eşleştiği açıklanabilen ve düzenli olarak gözden geçirilen listedir.",
    sections: [
      {
        title: "Markanın gerçek yazılışlarını toplayın",
        paragraphs: [
          "Şirketin ticari adı her haberde kullanılmaz. Basın bültenlerini, ürün ambalajlarını ve ekiplerin kullandığı kısa adları inceleyerek bir ad haritası çıkarın. Türkçe karakterli ve karaktersiz yazılışlar, birleşik kelimeler ve eski marka adları için ayrı not tutun.",
          "Kurgusal 'Ada' markası çok genel bir sözcüktür. Tek başına arandığında coğrafya haberleriyle karışabilir. 'Ada Teknoloji', ürün adı ve sektör bağlamı daha anlamlı sinyaller verir. Yönetici adını da başka kişilerle karışabilecekse şirket bağlamıyla değerlendirin.",
        ],
      },
      {
        title: "Her kelimeye bir amaç verin",
        paragraphs: [
          "Bir kelimeyi listeye eklemeden önce hangi gelişmeyi yakalayacağını yazın. Ürün adı müşteri deneyimini, yönetici adı röportajları, rakip adı pazar hamlelerini gösterebilir. Amaçları farklı olan kelimeler için ayrı takipler açmak bildirimleri ve raporları okunur kılar.",
          "Hariç tutulacak kelimeleri gerçek yanlış eşleşmelerden üretin. Henüz görmediğiniz bir ihtimali engellemek için çok sayıda dışlama eklemek, değerli içeriği de kaçırabilir. Kullandığınız aracın eşleşme kurallarını kontrol edin; tüm araçlar aynı sorgu sözdizimini desteklemez.",
        ],
      },
      {
        title: "İlk sonuçları örnekleyerek test edin",
        paragraphs: [
          "İlk 30–50 sonucu ekipçe gözden geçirmek pratik bir başlangıçtır; bu sayı istatistiksel doğruluk garantisi değildir. Her sonuca doğru, belirsiz veya yanlış etiketi verin. Belirsiz içeriklerde başlığı tek başına yorumlamayın; yayıncı bağlantısına giderek bağlamı kontrol edin.",
          "Haftalık bakımda yeni ürünleri ekleyin, artık kullanılmayan isimleri arşivleyin ve her değişikliğin tarihini kaydedin. Böylece sonraki ay haber sayısı arttığında bunun kampanyadan mı, sorgu kapsamının büyümesinden mi kaynaklandığını ayırt edebilirsiniz.",
        ],
      },
    ],
    checklist: [
      "Resmî ad, kısa ad ve ürün listesini çıkarın.",
      "Genel kelimeler için ayırt edici bağlam belirleyin.",
      "Yanlış eşleşmeleri gerçek sonuçlardan öğrenin.",
      "Sorgu değişikliklerini tarihleyin.",
    ],
    faq: [
      {
        question: "Rakip adlarını aynı sorguya eklemeli miyim?",
        answer:
          "Karşılaştırma için rakipleri ayrı takiplerde tutmak daha açıklanabilir sonuç verir. Raporlama aşamasında aynı dönem ve kaynak kapsamıyla birleştirebilirsiniz.",
      },
      {
        question: "Türkçe karakterler önemli mi?",
        answer:
          "Yayıncılar farklı yazılışlar kullanabilir. Kullandığınız sistemin normalleştirme davranışını test edip gerekirse alternatif yazılışları ekleyin.",
      },
    ],
    related: [
      "medya-takibi-nedir",
      "rakip-analizi-medya",
      "kriz-iletisimi-erken-uyari",
    ],
    cta: {
      ...features,
      title: "Sorgunuzu gerçek sonuçlarla geliştirin",
      body: "Mediaory'de marka ve konu takiplerini ayırarak gelen eşleşmeleri daha anlaşılır bir iş akışına dönüştürün.",
    },
  },
  {
    slug: "rss-ile-haber-takibi",
    title: "RSS ile haber takibi: Kaynak listesinden anlamlı akışa",
    category: "Medya takibi",
    description:
      "RSS ve Atom akışlarını haber takibinde nasıl kullanacağınızı öğrenin. Dil, kaynak kalitesi, tekrarlar ve eksik kapsama için pratik rehber.",
    keywords: ["RSS ile haber takibi", "RSS nedir", "haber akışı"],
    answer:
      "RSS, yayıncıların yeni içerikleri başlık, bağlantı ve diğer alanlarla paylaşabildiği bir akış biçimidir. RSS ile haber takibi, çok sayıda siteyi tek tek açmak yerine erişilebilir akışları düzenli kontrol etmeyi sağlar; fakat tüm web içeriğini veya eksiksiz geçmiş arşivi temsil etmez.",
    sections: [
      {
        title: "Akışı yayıncı sayfasıyla doğrulayın",
        paragraphs: [
          "Bir RSS adresi bulduğunuzda önce yayıncının kendisine ait olup olmadığını kontrol edin. Haber başlıkları, bağlantıları ve tarihleri beklediğiniz içerikle örtüşüyor mu? Bazı akışlar ana sayfanın tamamını değil, tek bir kategoriyi sunar. Bu farkı kaynak kaydına yazın.",
          "RSS standardında kanal dili gibi alanlar bulunur; ancak yayıncıların her alanı dolduracağı varsayılmamalıdır. Atom da benzer bir kullanım amacına sahip farklı bir biçimdir. Kaynağın ülkesini alan adına, içerik dilini ise yalnız ülkeye bakarak belirlemek güvenilir bir yöntem değildir.",
        ],
      },
      {
        title: "Kaynak sayısı yerine karar kapsamını büyütün",
        paragraphs: [
          "Bir iletişim ekibi için binlerce ilgisiz akış yerine sektörü ve coğrafyayı iyi temsil eden bir çekirdek liste daha kullanışlı olabilir. Ulusal yayınları, sektör yayınlarını ve resmî duyuru kaynaklarını ayrı gruplarda tutun. Fırsat takibinde ise hibe kurumları ve girişimcilik yayınları için ayrı bir kapsam kullanın.",
          "Her kaynağa konu, dil ve takip amacı eklemek, bir kaynağı durdurmanız gerektiğinde ne kaybedeceğinizi görmenizi sağlar. Erişilemeyen akışların kaydını koruyun; geçici bağlantı hatası ile kalıcı kapanmayı birbirine karıştırmayın.",
        ],
      },
      {
        title: "Tekrarları ve boşlukları görünür kılın",
        paragraphs: [
          "Aynı basın bülteni birçok yayıncıda çıkabilir. Bunlar erişim kapsamı için değerli olsa da yeni gelişme sayısını şişirebilir. Tekrarları gruplamak ve yayıncı bağlantılarını korumak hem hızlı okuma hem de sonradan doğrulama için önemlidir.",
          "Akışlar çoğu zaman sınırlı sayıda son içerik taşır. Kontrol aralığı uzadığında bazı yayınlar kaçabilir; çok sık kontrol ise gereksiz işlem yükü oluşturabilir. İzleme planında kaynak güncelliğini ve okunamayan akışları ayrı göstermek, kapsam konusunda gerçekçi bir rapor üretir.",
        ],
      },
    ],
    checklist: [
      "Akışın yayıncıya ait olduğunu doğrulayın.",
      "Konu, ülke ve dili ayrı alanlarda kaydedin.",
      "Benzer haberleri bağımsız gelişmelerden ayırın.",
      "Okunamayan kaynakları görünür tutun.",
    ],
    faq: [
      {
        question: "RSS tüm eski haberleri getirir mi?",
        answer:
          "Genellikle hayır. Kapsamı yayıncı belirler; birçok akış yalnız son içerikleri içerir.",
      },
      {
        question: "RSS, bütün sosyal ağları takip etmek için yeterli mi?",
        answer:
          "Hayır. Sosyal platformların veri erişimi ve resmî entegrasyon koşulları farklıdır; RSS varlığı platform genelinde kapsama anlamına gelmez.",
      },
    ],
    sources: [rss],
    related: [
      "medya-takibi-nedir",
      "haber-tekrarlarini-ayiklama",
      "sosyal-medya-dinleme",
    ],
    cta: {
      ...features,
      title: "Akışı izleme işine dönüştürün",
      body: "Mediaory'nin kaynak ve konu odaklı takibini inceleyerek haberleri ekibinizin karar gündemine bağlayın.",
    },
  },
  {
    slug: "rakip-analizi-medya",
    title: "Medya verisiyle rakip analizi: Haberlerden ne öğrenilir?",
    category: "Medya takibi",
    description:
      "Rakip haberlerini ürün, yatırım, iş birliği ve mesaj başlıklarında analiz edin. Görünürlük ile ticari başarıyı karıştırmadan karar üretin.",
    keywords: ["rakip analizi", "medya rakip takibi", "rekabet istihbaratı"],
    answer:
      "Medya verisiyle rakip analizi, rakiplerin kamuya açık duyurularını ve haberlerini belirli bir dönem ve kaynak kapsamıyla incelemektir. Ürün, iş birliği ve mesaj değişimlerini gösterebilir; ancak şirketin gelirini, pazar payını veya iç stratejisini tek başına kanıtlamaz.",
    sections: [
      {
        title: "Karşılaştırılabilir bir rakip seti kurun",
        paragraphs: [
          "Doğrudan rakip, aynı müşteri ihtiyacını farklı biçimde çözen alternatif ve sektörün büyük oyuncusu farklı gruplardır. Hepsini tek sıralamaya koymak küçük şirketi haksız biçimde görünmez gösterebilir. Önce hangi rekabet sorusunu cevaplayacağınızı belirleyin.",
          "Kurgusal bir B2B yazılım ekibi için soru 'Kim daha çok haber oldu?' yerine 'Hangi müşteri sorunları yeni ürün duyurularında öne çıktı?' olabilir. Her şirketi aynı dönem, dil ve kaynak listesiyle izlemek karşılaştırmayı daha tutarlı kılar.",
        ],
      },
      {
        title: "Haberleri olay türüne göre okuyun",
        paragraphs: [
          "İçerikleri ürün lansmanı, yatırım, iş ortaklığı, yönetim değişikliği ve müşteri örneği gibi olay türlerine ayırın. Bir yatırım haberinin çok sayıda yeniden yayımı ile haftalar boyunca yayımlanan farklı müşteri örnekleri aynı sinyal değildir.",
          "Başlıkta güçlü bir iddia görürseniz asıl yayıncıya ve varsa şirket duyurusuna dönün. 'Lider', 'ilk' veya 'en büyük' gibi ifadeler bağımsız olarak doğrulanmamış pazarlama söylemi olabilir. Raporunuzda doğrulanan olgu ile şirketin iddiasını ayrı yazın.",
        ],
      },
      {
        title: "Analizi bir iş kararına bağlayın",
        paragraphs: [
          "Her bulguya bir sonraki adım ekleyin: satış sunumundaki karşılaştırmayı güncellemek, bir ortaklık alanını araştırmak veya içerik planına yeni bir müşteri sorusu eklemek. Aynı bulgunun satış ve iletişim ekipleri için farklı anlamları olabilir; raporu alıcının kararına göre kısaltın.",
          "Aylık değerlendirmede tek bir gündeme aşırı tepki vermeyin. Kaynak kapsamı veya sorgu değişmişse bunu yöntem notuna ekleyin. Medya görünürlüğü bir dış sinyaldir; müşteri görüşmeleri ve kendi ürün verilerinizle birlikte değerlendirilmesi daha sağlam kararlar verir.",
        ],
      },
    ],
    checklist: [
      "Doğrudan rakipleri alternatiflerden ayırın.",
      "Aynı dönem ve kaynak kapsamını kullanın.",
      "Tekrarlanan haberleri olay gruplarına ayırın.",
      "Her bulguya ekip ve aksiyon ekleyin.",
    ],
    faq: [
      {
        question: "Çok haber olan rakip daha başarılı mı?",
        answer:
          "Bu çıkarım tek başına yapılamaz. Haber yoğunluğu kampanya, kriz veya tek bir duyurunun yeniden yayımı nedeniyle artabilir.",
      },
      {
        question: "Rakip analizi ne sıklıkta yapılmalı?",
        answer:
          "Kritik gelişmeler için uyarı, düzenli kararlar için haftalık veya aylık özet kullanılabilir. Sıklığı sektör temposu belirler.",
      },
    ],
    related: [
      "share-of-voice-nedir",
      "sektor-gundemi-takibi",
      "marka-takibi-anahtar-kelime",
    ],
    cta: {
      ...features,
      title: "Rakip haberlerini karşılaştırılabilir hale getirin",
      body: "Mediaory ile ayrı takipler ve raporlar üzerinden rekabet gündemini ekip içinde paylaşın.",
    },
  },
  {
    slug: "kriz-iletisimi-erken-uyari",
    title: "Kriz iletişiminde erken uyarı planı nasıl kurulur?",
    category: "Medya takibi",
    description:
      "Olumsuz haberleri bağlamıyla değerlendiren erken uyarı planı kurun. Alarm seviyeleri, sorumlu ekip ve ilk doğrulama adımları.",
    keywords: ["kriz iletişimi", "erken uyarı", "marka itibar takibi"],
    answer:
      "Kriz iletişiminde erken uyarı, riskli gelişmeleri tespit edip doğrulama ve karar sorumluluğunu önceden tanımlamaktır. Her olumsuz başlık kriz değildir; yayılım, iddianın niteliği, kaynak ve olası etki birlikte değerlendirilmelidir.",
    sections: [
      {
        title: "Alarmı üç karar seviyesine ayırın",
        paragraphs: [
          "Bilgilendirme, inceleme ve acil değerlendirme seviyeleri başlangıç için kullanılabilir. Bilgilendirme gündeme alınacak bir haberi; inceleme doğrulanması gereken iddiayı; acil değerlendirme ise açık bir güvenlik, operasyon veya itibar riskini ifade edebilir. Bunlar örnek seviyelerdir, her kurum kendi ölçütlerini yazmalıdır.",
          "Yalnızca 'şikâyet' kelimesi geçtiği için acil alarm üretmek ekibi kısa sürede yorabilir. Marka eşleşmesini, iddianın yeniliğini ve yayıncı bağlamını birlikte kontrol edin. İroni, eski haberin yeniden paylaşılması ve alıntılanan rakip açıklaması yanlış yorumlara neden olabilir.",
        ],
      },
      {
        title: "İlk kontrol paketini hazırlayın",
        paragraphs: [
          "Alarmın yanında kaynak bağlantısı, yayın zamanı, hangi sorgunun eşleştiği ve kısa bir durum notu olsun. Kim doğrulayacak, kime aktarılacak ve hangi kanalda karar verilecek? Bu sorular kriz anında değil, plan hazırlanırken cevaplanmalıdır.",
          "Kurgusal bir ürün arızası haberi geldiğinde önce ürün ve tarih doğru mu, yayıncı yeni bir olgu mu aktarıyor, kurumun olay kaydı var mı diye bakılır. Bir başlık görüntüsünü tek kanıt gibi dolaştırmak yerine ilk kaynağı ve varsa resmî açıklamayı saklamak bilgi kaybını azaltır.",
        ],
      },
      {
        title: "Uyarı kalitesini sonradan değerlendirin",
        paragraphs: [
          "İnceleme sonunda alarmın işe yarayıp yaramadığını kaydedin. Yanlış eşleşme, eski haber veya gerçekten erken görülen risk gibi sınıflar kullanabilirsiniz. Bildirim sayısını azaltmak tek başına hedef değildir; önemli gelişmenin doğru kişiye ulaşması hedeftir.",
          "Mediaory'deki izleme ve uyarı akışını ekibinizin karar prosedürüyle birlikte kullanın. Otomatik etiket veya özet insan doğrulamasının yerini almamalıdır. Kritik durumda iletişim, operasyon ve ilgili uzman ekipler ortak değerlendirme yapmalıdır.",
        ],
      },
    ],
    checklist: [
      "Alarm seviyelerini örneklerle yazın.",
      "Her seviyeye sorumlu ve iletişim kanalı atayın.",
      "Kaynak, zaman ve sorgu bilgisini saklayın.",
      "Yanlış ve yararlı uyarıları düzenli inceleyin.",
    ],
    faq: [
      {
        question: "Duygu analizi kriz kararını otomatik verebilir mi?",
        answer:
          "Hayır. Duygu etiketi önceliklendirme sinyali olabilir; olgunun doğruluğu, bağlamı ve etkisi insan değerlendirmesi gerektirir.",
      },
      {
        question: "Her olumsuz haber için açıklama yapılmalı mı?",
        answer:
          "Bu kararı haber adedi değil, olayın doğruluğu, etkisi ve kurumun iletişim prosedürü belirler.",
      },
    ],
    related: [
      "duygu-analizi-sinirlari",
      "marka-takibi-anahtar-kelime",
      "medya-takip-raporu",
    ],
    cta: {
      ...features,
      title: "Uyarıyı doğru ekibe bağlayın",
      body: "Mediaory'nin bildirim ve izleme özelliklerini kurumunuzun doğrulama ve eskalasyon planıyla eşleştirin.",
    },
  },
  {
    slug: "share-of-voice-nedir",
    title: "Share of Voice nedir? Medya görünürlüğü nasıl hesaplanır?",
    category: "İletişim ölçümü",
    description:
      "Share of Voice formülünü örnekle öğrenin. Rakip seti, kaynak kapsamı ve tekrarların sonucu nasıl değiştirdiğini görün.",
    keywords: ["share of voice", "medya görünürlük payı", "SOV hesaplama"],
    answer:
      "Share of Voice (SOV), seçilen markanın ölçülen görünürlüğünün karşılaştırma grubunun toplam görünürlüğü içindeki payıdır. Haber adedi üzerinden hesaplanıyorsa formül: markanın ilgili haber sayısı / gruptaki toplam ilgili haber sayısı × 100. Sonuç, seçilen dönem ve kapsam için geçerlidir.",
    sections: [
      {
        title: "Ölçüm birimini baştan seçin",
        paragraphs: [
          "Haber adedi, marka anılması ve tahmini erişim farklı ölçüm birimleridir. Birini kullanıp diğerinin adını vermeyin. Başlangıç için ilgili haber adedi anlaşılır olabilir; ancak tekrarların dahil edilip edilmediği ve aynı haberde birden çok markanın nasıl sayıldığı açıklanmalıdır.",
          "Kurgusal örnekte Ada 40, Bora 35 ve Ceren 25 ilgili haberde yer alsın. Toplam 100 ise Ada'nın haber adedi bazlı payı yüzde 40'tır. Bu örnek gerçek şirket verisi değildir ve yüzde 40 pazar payı, satış payı veya tüketici bilinirliği anlamına gelmez.",
        ],
      },
      {
        title: "Paydanın değişmesini kontrol edin",
        paragraphs: [
          "Yeni bir rakip eklemek veya kaynak listesini büyütmek oranı değiştirebilir. Bu nedenle aylık karşılaştırmada aynı rakip setini, dönem uzunluğunu ve dil kapsamını kullanın. Değişiklik gerekiyorsa yeni yöntemi açıkça işaretleyin; eski ve yeni sonucu tek çizgide açıklamasız sunmayın.",
          "Bir kriz sırasında görünürlük yükselmiş olabilir. SOV artışını başarı diye raporlamadan önce gündemin niteliğine bakın. Anahtar mesajların aktarılması, yayıncı çeşitliliği ve olumsuz bağlam gibi ek göstergeler oranı yorumlamaya yardımcı olur.",
        ],
      },
      {
        title: "Oranı karar sorusuyla birlikte raporlayın",
        paragraphs: [
          "Yönetim raporunda yalnız bir yüzde yerine 'hangi konuda, hangi kaynaklarda, hangi dönemde' sorularını cevaplayın. Bir ürün lansmanında genel marka görünürlüğü ile ürün kategorisindeki görünürlük farklı sonuç verebilir. Dar ama doğru kapsam, geniş ve belirsiz bir karşılaştırmadan daha açıklanabilirdir.",
          "Tablonun yanına en önemli üç gelişmeyi ekleyin. Oran değişiminin tek duyurudan mı, yeni kaynaklardan mı yoksa devam eden bir gündemden mi geldiğini açıklayın. Mediaory takiplerinden üretilen veriyi de aynı yöntem notuyla değerlendirerek ekipler arasında tutarlı bir ölçüm dili kurabilirsiniz.",
        ],
      },
    ],
    checklist: [
      "Ölçüm birimini yazın.",
      "Rakip setini ve kaynak kapsamını sabitleyin.",
      "Tekrar sayımını açıklayın.",
      "SOV'u pazar payı olarak sunmayın.",
    ],
    faq: [
      {
        question: "Yüksek SOV her zaman iyi mi?",
        answer:
          "Hayır. Kriz veya olumsuz gündem de görünürlüğü artırabilir. Oranı içerik bağlamıyla birlikte okuyun.",
      },
      {
        question: "Toplam haber sayısı sıfırsa ne yapılır?",
        answer:
          "Oran hesaplanamaz. Sıfıra bölmek yerine dönemde ilgili veri bulunmadığını belirtin.",
      },
    ],
    related: ["rakip-analizi-medya", "pr-kpi-olcumu", "medya-takip-raporu"],
    cta: {
      ...features,
      title: "Karşılaştırmanın yöntemini görünür kılın",
      body: "Mediaory'deki marka ve rakip takiplerini aynı kapsamda kurarak görünürlük raporunuzu hazırlayın.",
    },
  },
  {
    slug: "medya-takip-raporu",
    title: "Medya takip raporu nasıl hazırlanır? Kullanılabilir bir şablon",
    category: "İletişim ölçümü",
    description:
      "Yönetimin okuyacağı medya raporu için amaç, kapsam, bulgu ve aksiyon şablonu. Haber listesini kısa bir karar özetine dönüştürün.",
    keywords: ["medya takip raporu", "PR raporu", "iletişim raporu şablonu"],
    answer:
      "İyi bir medya takip raporu; amaç, dönem ve kaynak kapsamını açıklar, önemli gelişmeleri özetler ve kimin hangi adımı atacağını gösterir. Bağlantı listesi kanıt katmanıdır; raporun asıl değeri bu içeriklerden çıkarılan açıklanabilir kararlardır.",
    sections: [
      {
        title: "İlk sayfayı karar özeti olarak tasarlayın",
        paragraphs: [
          "Raporun başına dönem, takip edilen marka ve tek cümlelik amaç koyun. Ardından üç önemli gelişme, bir risk ve bir sonraki adım yazın. Risk yoksa bunu da kapsamı belirterek ifade edin; 'hiç risk yok' gibi sınırsız bir iddia kullanmayın.",
          "Kurgusal örnek: 'Bu hafta ürün duyurusu sektör yayınlarında yer aldı; teslimatla ilgili bir iddia doğrulama bekliyor; destek ekibi cuma gününe kadar durum notu hazırlayacak.' Böyle bir özet, elli bağlantının açıklamasız gönderilmesinden daha kolay aksiyona dönüşür.",
        ],
      },
      {
        title: "Yöntem notunu kısa ama eksiksiz tutun",
        paragraphs: [
          "Kaynak türlerini, dil ve ülke kapsamını, sorguları ve tekrarların nasıl ele alındığını belirtin. Önceki döneme göre kaynak veya anahtar kelime değiştiyse ekleyin. Erişilemeyen kaynakların olması, sayının tüm yayınları temsil etmediği anlamına gelebilir.",
          "Veri alanlarında tarih, yayıncı, başlık, bağlantı, ilgili takip, konu ve değerlendirme notu kullanabilirsiniz. Başlık ve kısa özetle çalışıyorsanız tam metin analizi yapılmış gibi sunmayın. Bir rapor okuyucusu sonuç ile gözlenen verinin kapsamını birbirinden ayırt edebilmelidir.",
        ],
      },
      {
        title: "Aksiyon tablosunu raporun sonuna bırakmayın",
        paragraphs: [
          "Her aksiyona sorumlu, son tarih ve beklenen çıktı ekleyin. 'Konuyu takip et' yerine 'İki yayıncıdaki iddiayı doğrula ve ekip notunu güncelle' gibi ölçülebilir görevler yazın. Bir sonraki raporda önceki aksiyonun durumuna dönmek raporu sürekli bir iş akışına bağlar.",
          "Mediaory'nin rapor çıktıları bu düzeni destekleyen bir başlangıç olabilir. Paylaşmadan önce müşteri veya kuruluş kapsamını, bağlantıların erişimini ve kişisel notları kontrol edin. Raporu alıcının ihtiyacına göre kısaltın; dış paylaşımla ekip içi çalışma sürümünü aynı içerikle göndermek her zaman uygun değildir.",
        ],
      },
    ],
    checklist: [
      "Dönem ve amacı ilk sayfaya yazın.",
      "Üç bulgu, bir risk ve sonraki adımı özetleyin.",
      "Kapsam ve tekrar yöntemini belirtin.",
      "Aksiyonlara sorumlu ve tarih ekleyin.",
    ],
    faq: [
      {
        question: "Günlük mü aylık mı rapor hazırlanmalı?",
        answer:
          "Operasyonel gelişmeler için kısa günlük/haftalık özet; eğilim ve değerlendirme için aylık rapor uygundur. Sıklığı alıcının karar temposuna göre seçin.",
      },
      {
        question: "Raporda bütün bağlantılar bulunmalı mı?",
        answer:
          "Gerekirse ek bölümünde bulunabilir. Ana bölümde karar için önemli gelişmeleri ve doğrulanabilir kanıtlarını öne çıkarın.",
      },
    ],
    related: ["pr-kpi-olcumu", "share-of-voice-nedir", "haber-tekrarlarini-ayiklama"],
    cta: {
      ...features,
      title: "Haber listesinden karar raporuna geçin",
      body: "Mediaory'nin rapor özelliklerini inceleyin ve ekip içi paylaşımınıza uygun bir izleme düzeni kurun.",
    },
  },
  {
    slug: "pr-kpi-olcumu",
    title: "PR KPI'ları: Haber adedinin ötesinde ne ölçülmeli?",
    category: "İletişim ölçümü",
    description:
      "PR performansını çıktı, kitle tepkisi ve iş sonucu olarak ayırın. Anahtar mesaj, nitelikli trafik ve aksiyon için ölçüm planı.",
    keywords: ["PR KPI", "iletişim ölçümü", "halkla ilişkiler performansı"],
    answer:
      "PR KPI'ları, iletişimin hedefiyle ilişkili göstergelerdir. Haber adedi bir çıktı göstergesidir; mesajın anlaşılması, ilgili ziyaret ve sonraki davranış farklı katmanlardır. Başarılı ölçüm bu katmanları birbirine karıştırmadan değerlendirir.",
    sections: [
      {
        title: "Amaç ile göstergeyi eşleştirin",
        paragraphs: [
          "Bir lansmanın amacı doğru ürün mesajını sektöre anlatmaksa anahtar mesajın ilgili içeriklerde yer alması anlamlı bir gösterge olabilir. Amaç nitelikli talep yaratmaksa haber sayısının yanında ilgili sayfaya gelen ziyaret ve demo talebi de takip edilmelidir. Her göstergenin hangi kararı desteklediğini yazın.",
          "AMEC'nin değerlendirme yaklaşımı, iletişim çıktılarını sonuç ve etkiden ayırmaya yardımcı olur. Bu ayrım, yayınlanan içerik sayısındaki artışı doğrudan satış başarısı diye sunmayı önler. Aşağıdaki iş akışı ise ekiplerin kendi hedeflerine uyarlayabileceği bir plan önerisidir.",
        ],
      },
      {
        title: "Az sayıda açıklanabilir KPI seçin",
        paragraphs: [
          "Başlangıçta kaynak kapsamı, ilgili içerik, anahtar mesaj aktarımı ve hedef aksiyon gibi dört alanı düşünün. Her alan için veri kaynağını ve sorumluyu belirleyin. Tahmini erişim kullanılıyorsa nasıl üretildiğini açıklayın; sayıyı gerçek okur sayısı gibi göstermeyin.",
          "Kurgusal hedef: 'Ürün sayfasından gelen demo taleplerinin hangi yayın bağlantılarıyla ilişkili olduğunu görmek.' Bunun için medya kaydı ile site analizi farklı veri kaynaklarıdır. Takip parametreleri ve olay ölçümü kurulmadıysa ilişkiyi kesinmiş gibi raporlamayın.",
        ],
      },
      {
        title: "Raporu açıklama ve öğrenmeyle tamamlayın",
        paragraphs: [
          "Sonuç düşükse hemen içerik ekibini suçlamak yerine yayın kapsamına, hedef kitlenin uygunluğuna ve sayfadaki sonraki adıma bakın. Güçlü görünürlük ile zayıf aksiyon arasında mesaj veya kullanıcı deneyimi boşluğu olabilir. Tek bir dönemdeki değişim nedensellik kanıtı değildir.",
          "Mediaory izleme ve raporları iletişim tarafındaki kanıtları düzenlemeye yardımcı olur. Site dönüşümü için kendi analiz ölçümünüzü ayrıca kullanın. Her ay bir KPI'ı artırmaya çalışmak yerine hangi göstergenin karar verdiğinizi değiştirdiğini ve hangi verinin eksik kaldığını değerlendirin.",
        ],
      },
    ],
    checklist: [
      "İletişim amacını ölçülebilir hale getirin.",
      "Çıktı, kitle tepkisi ve sonucu ayırın.",
      "Her KPI için veri kaynağı ve sorumlu yazın.",
      "Tahminleri gerçek kullanıcı sayısından ayırın.",
    ],
    faq: [
      {
        question: "Haber adedi gereksiz bir ölçüm mü?",
        answer:
          "Hayır. Kapsamı belli bir çıktı göstergesidir; tek başına iletişimin etkisini açıklamaz.",
      },
      {
        question: "Medya takibi satış etkisini kesin ölçer mi?",
        answer:
          "Tek başına ölçmez. Dönüşüm verisi ve uygun değerlendirme yöntemi gerekir; aynı anda artan iki gösterge nedensellik kanıtı değildir.",
      },
    ],
    sources: [amec],
    related: [
      "medya-takip-raporu",
      "share-of-voice-nedir",
      "seo-geo-icerik-stratejisi",
    ],
    cta: {
      ...features,
      title: "Ölçümün medya katmanını düzenleyin",
      body: "Mediaory ile görünürlük verisini kaynağı ve bağlamıyla raporlayın; iş sonuçlarını kendi dönüşüm verinizle tamamlayın.",
    },
  },
  {
    slug: "duygu-analizi-sinirlari",
    title: "Duygu analizi ne söyler, ne söylemez?",
    category: "İletişim ölçümü",
    description:
      "Olumlu, olumsuz ve nötr etiketleri doğru yorumlayın. Türkçe ironi, alıntı ve karma bağlam için insan kontrolü gereken noktalar.",
    keywords: ["duygu analizi", "sentiment analizi", "Türkçe medya analizi"],
    answer:
      "Duygu analizi, metnin olumlu, olumsuz veya nötr yönünü tahmin etmeye çalışan bir yöntemdir. Etiket bir değerlendirme sinyalidir; haberin doğruluğunu, marka üzerindeki etkisini veya krizin seviyesini tek başına belirlemez.",
    sections: [
      {
        title: "Etiketin neye uygulandığını sorun",
        paragraphs: [
          "Başlık, kısa özet ve tam metin aynı bağlamı taşımaz. Başlıktaki olumsuz bir olay markanın başarılı müdahalesini anlatan haberde yer alabilir. Analiz yalnız başlık ve özet üzerinden yapılıyorsa sonuç da o sınırlı gözlemi temsil eder.",
          "Bir haberde birkaç kuruluş bulunabilir. Sektör için olumsuz, belirli bir şirket için olumlu gelişme aynı metinde geçebilir. 'Metnin duygusu' ile 'markaya yönelik tutum' farklı sorulardır. Kullanılan etiketin hangi soruya cevap verdiğini raporda açıkça belirtin.",
        ],
      },
      {
        title: "Türkçe bağlamı insan kontrolüyle tamamlayın",
        paragraphs: [
          "İroni, mecaz, olumsuzluk ekleri ve alıntılanan açıklamalar otomatik yorumlamayı zorlaştırabilir. 'Beklenen sorun yaşanmadı' gibi bir cümlede sorun kelimesi bulunur, fakat ifade doğrudan olumsuz deneyim anlatmaz. Bu örnek yöntemin dikkat gerektirdiğini gösterir; belirli bir modelin kesin hatası değildir.",
          "Kritik içeriklerde yayıncı bağlantısını açın, iddianın kimden geldiğine bakın ve markanın olay içindeki rolünü kontrol edin. Belirsiz durumları zorla olumlu veya olumsuz yapmak yerine inceleme bekleyen sınıfta tutmak daha açıklanabilir bir rapor üretir.",
        ],
      },
      {
        title: "Kalite kontrolünü örneklerle kurun",
        paragraphs: [
          "Ekipçe seçilen küçük bir içerik grubunu bağımsız olarak etiketleyin ve uyuşmazlıkları konuşun. Aynı olaya farklı yorum geliyorsa yalnız araç değil, kurumun etiketleme tanımı da net olmayabilir. Birkaç örnek üzerinden genel doğruluk oranı iddia etmeyin.",
          "Mediaory'deki otomatik analiz ve özetleri hızlı ön değerlendirme olarak kullanın. Riskli içerikte insan doğrulamasını, nihai etiketi ve gerekçeyi kaydetmek sonraki raporların tutarlılığını artırır. Bildirim kararını da tek duygu etiketine değil, kaynak ve olay bağlamına bağlayın.",
        ],
      },
    ],
    checklist: [
      "Analizin başlık mı tam metin mi olduğunu belirtin.",
      "Metin duygusunu marka tutumundan ayırın.",
      "Kritik içeriklerde asıl kaynağı inceleyin.",
      "Belirsiz etiketlere insan değerlendirmesi ekleyin.",
    ],
    faq: [
      {
        question: "Nötr etiket önemsiz içerik demek mi?",
        answer:
          "Hayır. Bir yatırım, mevzuat veya ürün duyurusu nötr dilde yazılıp önemli bir iş kararı gerektirebilir.",
      },
      {
        question: "Olumsuz etiket otomatik kriz uyarısı olmalı mı?",
        answer:
          "Tek başına yeterli değildir. İddianın doğruluğu, yayılımı, güncelliği ve marka etkisi birlikte değerlendirilmelidir.",
      },
    ],
    related: ["kriz-iletisimi-erken-uyari", "pr-kpi-olcumu", "medya-takip-raporu"],
    cta: {
      ...features,
      title: "Analizi kaynak bağlamıyla birlikte okuyun",
      body: "Mediaory'nin analiz özelliklerini inceleyin; kritik değerlendirmeler için ekip kontrolünü iş akışınıza ekleyin.",
    },
  },
  {
    slug: "haber-tekrarlarini-ayiklama",
    title: "Aynı haber neden tekrar gelir? Medya takibinde tekilleştirme",
    category: "Medya takibi",
    description:
      "Basın bülteni tekrarlarını yeni gelişmelerden ayırın. Tekilleştirmede bağlantı, tarih, güncelleme ve yayıncı kapsamını koruyun.",
    keywords: ["haber tekilleştirme", "tekrar haber", "medya takibi tekrarları"],
    answer:
      "Haber tekilleştirme, aynı veya çok benzer içerikleri gruplayarak tekrar okumayı azaltır. Farklı yayıncıdaki her bağlantıyı silmek anlamına gelmez; özgün gelişme ile yayın kapsamını ayrı tutmak gerekir.",
    sections: [
      {
        title: "Tekrarın kaynağını ayırt edin",
        paragraphs: [
          "Bir basın bülteni farklı yayıncılarca yeniden yayımlanabilir. Aynı site içerik adresine izleme parametresi ekleyebilir veya başlığı güncelleyebilir. Bazen de ilk habere yeni bilgi eklenir. Bu durumların hepsi benzer görünür, fakat raporlama anlamları farklıdır.",
          "Kurgusal bir yatırım duyurusunun on sitede yayımlanması on ayrı yatırım değildir. Yine de bu on yayıncı görünürlük kapsamını gösterir. Olay sayısını bir, yayıncı sayısını on olarak raporlamak iki bilgiyi de korur. Örnek rakamlar gerçek Mediaory müşteri verisi değildir.",
        ],
      },
      {
        title: "Benzerliği güncelleme kontrolüyle tamamlayın",
        paragraphs: [
          "Başlık benzerliği yararlı bir sinyaldir, fakat tek başına karar vermek için yetersiz olabilir. Tarih, kaynak ve bağlantıyla birlikte okuyun. İkinci içerik yeni tutar, yeni açıklama veya farklı tarafın yanıtını içeriyorsa tamamen aynı olayın kopyası saymak önemli bir gelişmeyi gizleyebilir.",
          "Bir grubun temsilci haberini seçerken ilk yayını veya en açıklayıcı kaynağı tercih edebilirsiniz. Bu seçimi yöntem notunda belirtin. İkincil yayıncıların bağlantılarını görünür tutmak daha sonra kaynak doğrulaması yapmayı ve yayın kapsamını incelemeyi kolaylaştırır.",
        ],
      },
      {
        title: "Tekilleştirmeyi rapor amacına göre kullanın",
        paragraphs: [
          "Sabah gündeminde tek temsilci içerik okuma yükünü azaltır. Kampanya görünürlük raporunda ise yayıncı kapsamı ayrıca değerlendirilir. Bir yaklaşımı diğerine uygulamak sonuçları yanlış küçültebilir veya büyütebilir.",
          "Mediaory'deki benzer içerik gruplarını inceleyerek önemli güncellemelerin kaybolmadığını kontrol edin. Özellikle kriz ve yatırım duyurularında yeni açıklamayı eski haberle karıştırmamak gerekir. Raporlarda ham içerik sayısı ve tekilleştirilmiş gelişme sayısını aynı isimle göstermeyin.",
        ],
      },
    ],
    checklist: [
      "Olay sayısını yayıncı sayısından ayırın.",
      "Benzer başlıklarda tarih ve yeni bilgiyi kontrol edin.",
      "Temsilci haberin seçimini açıklayın.",
      "Kaynak bağlantılarını koruyun.",
    ],
    faq: [
      {
        question: "Tekrarları tamamen silmeli miyim?",
        answer:
          "Görünürlük analizi için yayıncı bağlantıları değerli olabilir. Günlük okuma için gruplamak, veri kaybı olmadan listeyi sadeleştirir.",
      },
      {
        question: "Başlık değişince yeni haber sayılır mı?",
        answer:
          "Her zaman değil. İçeriğin yeni bir olgu veya güncelleme getirip getirmediğine bakmak gerekir.",
      },
    ],
    related: ["rss-ile-haber-takibi", "share-of-voice-nedir", "medya-takip-raporu"],
    cta: {
      ...features,
      title: "Tekrarı azaltın, kapsamı koruyun",
      body: "Mediaory'nin benzer haberleri düzenleyen özelliklerini inceleyerek günlük okuma ve raporlamayı ayırın.",
    },
  },
  {
    slug: "firsat-radari-nedir",
    title: "Fırsat radarı nedir? Haberlerden iş fırsatı bulma rehberi",
    category: "Fırsat radarı",
    description:
      "Hibe, yatırım, etkinlik ve iş birliği duyurularını ekip profilinize göre değerlendirin. Fırsat radarı için seçim ve eleme planı.",
    keywords: ["fırsat radarı", "iş fırsatı takibi", "hibe çağrı takibi"],
    answer:
      "Fırsat radarı, kamuya açık gelişmeleri bir ekip veya kuruluşun hedefleriyle eşleştirerek değerlendirmeye değer duyuruları görünür kılan bir iş akışıdır. Bulunan haber bir uygunluk veya kabul garantisi değildir; ilk keşiften sonra resmî koşullar kontrol edilmelidir.",
    sections: [
      {
        title: "Profilinizi seçimlerle sadeleştirin",
        paragraphs: [
          "Önce sektör, kuruluş aşaması, hedef coğrafya ve fırsat türünü belirleyin. Örneğin kurgusal bir erken aşama iklim teknolojisi girişimi hibe, hızlandırıcı ve pilot iş birliği arıyor olabilir. Bu profil, genel bir 'yatırım' aramasından daha açıklanabilir sonuç verir.",
          "Her alana uzun metin yazmak yerine seçilebilir seçeneklerle başlayın; standart seçeneklerin kapsamadığı ihtiyacı kısa bir özel notla ekleyin. Çok fazla seçim yapmak kapsamı genişletip alakasız sonuçları artırabilir. Öncelikli ihtiyacı seçmek ekip zamanını korur.",
        ],
      },
      {
        title: "Eşleşme ile uygunluğu ayırın",
        paragraphs: [
          "Bir haber profilinizdeki kelimeleri içerdiğinde potansiyel eşleşme oluşur. Ancak başvuru sahibi türü, şirketin kuruluş tarihi, proje konusu, coğrafya ve son tarih gibi koşullar ayrıca incelenmelidir. Özellikle duyurunun haber yayını ile resmî çağrı belgesi arasında fark bulunabilir.",
          "Kayıtta neden ilgili olduğunu, hangi koşulun belirsiz kaldığını ve asıl duyuru bağlantısını saklayın. Son tarih yazılmamışsa tahmin etmeyin. Yalnız ilgilendiğiniz sektörle ilgili olması, bir çağrının ekibiniz için başvurulabilir olduğu anlamına gelmez.",
        ],
      },
      {
        title: "Fırsatı görev ve takvime bağlayın",
        paragraphs: [
          "Bulunan duyurular için incelenecek, uygun, beklemede ve elendi gibi aşamalar belirleyin. Her kayıt için bir sorumlu ve bir sonraki değerlendirme tarihi olsun. Eleme nedenini kaydetmek aynı uygunsuz fırsatı tekrar değerlendirmeyi önler.",
          "Mediaory Fırsat Radarı'nı keşif katmanı olarak kullanarak ilgili içerikleri değerlendirme gündeminize taşıyın. Başvuru dosyası, resmî şart kontrolü ve kurumla iletişim ekibinizin ayrı işidir. Bu ayrım, otomatik öneriye gereğinden fazla güvenmeden daha düzenli bir fırsat akışı kurar.",
        ],
      },
    ],
    checklist: [
      "Sektör, aşama, coğrafya ve fırsat türünü seçin.",
      "Her eşleşmenin neden ilgili olduğunu kaydedin.",
      "Resmî koşulları ve son tarihi doğrulayın.",
      "Sorumlu ve değerlendirme tarihi atayın.",
    ],
    faq: [
      {
        question: "Fırsat radarı başvuruyu otomatik yapar mı?",
        answer:
          "Bu rehberdeki akış keşif ve değerlendirmeye yöneliktir. Başvuru koşulları ve dosyası ayrıca hazırlanmalıdır.",
      },
      {
        question: "Birden fazla fırsat türü seçebilir miyim?",
        answer:
          "İhtiyacınız varsa seçebilirsiniz; fakat öncelik sırası koymak değerlendirme yükünü yönetmeyi kolaylaştırır.",
      },
    ],
    related: [
      "hibe-destek-cagrisi-takibi",
      "startup-yatirim-haberleri",
      "hizlandirici-program-secimi",
    ],
    cta: {
      ...opportunities,
      title: "Kendi fırsat profilinizi oluşturun",
      body: "Fırsat Radarı'nda sektörünüzü ve aradığınız fırsat türlerini belirleyerek keşif akışınızı düzenleyin.",
    },
  },
  {
    slug: "hibe-destek-cagrisi-takibi",
    title: "Hibe ve destek çağrıları nasıl takip edilir?",
    category: "Fırsat radarı",
    description:
      "KOSGEB, TÜBİTAK ve diğer resmî çağrılar için düzenli takip sistemi kurun. Uygunluk, belge ve son tarih kontrolünü keşiften ayırın.",
    keywords: ["hibe destek çağrıları", "hibe takibi", "girişim destekleri"],
    answer:
      "Hibe ve destek çağrısı takibinde haber keşfi ile resmî uygunluk kontrolü ayrı adımlardır. Program türü, başvuru sahibi, coğrafya, proje kapsamı ve takvim birlikte doğrulanmalıdır. Güncel tutar ve koşullar için her zaman çağrıyı açan kurumun belgesine bakılmalıdır.",
    sections: [
      {
        title: "Hibe, destek ve yatırım aynı şey değildir",
        paragraphs: [
          "Bir duyurunun başlığında finansman geçmesi onun geri ödemesiz hibe olduğu anlamına gelmez. Geri ödemeli destek, öz sermaye yatırımı ve hızlandırıcı programı farklı yükümlülükler doğurabilir. Çağrının resmî türünü görmeden fırsat kartına 'hibe' etiketi koymayın.",
          "Türkiye'de KOSGEB ve TÜBİTAK gibi kurumların program sayfaları başlangıç kaynaklarıdır. Bu yazı açık bir çağrı listesi veya güncel finansal şart özeti değildir. Kaynak bağlantıları üzerinden ilgili dönemin uygulama esaslarını ve duyuru tarihini kontrol edin.",
        ],
      },
      {
        title: "Bir uygunluk kartı oluşturun",
        paragraphs: [
          "Kartta kurum, resmî bağlantı, çağrı adı, başvuru sahibi türü, konu, coğrafya, son tarih ve belirsiz koşullar bulunsun. Şirket yaşı veya sektör kodu gibi ayrıntılar haberde yer almayabilir. Haber özetiyle karar vermek yerine asıl belgede koşulu arayın.",
          "Kurgusal bir teknoloji ekibi için ilk eleme, projenin konusu ve başvuru sahibinin türü üzerinden yapılabilir. İkinci kontrol bütçe, ortaklık ve belge ihtiyacıdır. Bir koşul belirsizse uygun kabul etmek yerine sorumlu kişinin kuruma danışacağı bir görev oluşturun.",
        ],
      },
      {
        title: "Son tarihten geriye doğru planlayın",
        paragraphs: [
          "Resmî son tarih ile ekibin iç hazırlık tarihini ayrı tutun. Belgelerin toplanması, ortakların katkısı ve başvurunun kontrolü zaman alabilir. İç takvimde son gün yerine daha erken bir gözden geçirme noktası belirlemek pratik bir çalışma önerisidir.",
          "Mediaory Fırsat Radarı ilgili duyuruları keşfetmenize yardımcı olabilir; resmî uygunluk kararı vermez. Güncellenen çağrı belgesini ve uzatılan tarihleri ayrıca takip edin. Başvuruyu göndermeden önce kurumun güncel sayfasını yeniden kontrol etmek eski haberle işlem yapma riskini azaltır.",
        ],
      },
    ],
    checklist: [
      "Finansman türünü resmî belgeden doğrulayın.",
      "Başvuru sahibi ve proje koşullarını kontrol edin.",
      "Resmî tarih ile iç hazırlık tarihini ayırın.",
      "Güncel belgeyi başvuru öncesi yeniden inceleyin.",
    ],
    faq: [
      {
        question: "Haberin yayımlandığı tarih son başvuru tarihi mi?",
        answer:
          "Hayır. Yayın tarihi ve son başvuru tarihi ayrı alanlardır. Son tarihi resmî çağrıdan doğrulayın.",
      },
      {
        question: "Bu yazıdaki bağlantılar güncel açık çağrı garantisi verir mi?",
        answer:
          "Hayır. Programların koşulları ve dönemleri değişebilir; kurumun güncel çağrı belgeleri esas alınır.",
      },
    ],
    sources: [
      {
        title: "KOSGEB — Girişimci Destek Programı",
        url: "https://www.kosgeb.gov.tr/site/tr/genel/destekler/25/girisimci-destek-programi",
      },
      {
        title: "TÜBİTAK — 1812 BiGG Yatırım",
        url: "https://tubitak.gov.tr/tr/destekler/sanayi/ulusal-destek-programlari/1812-yatirim-tabanli-girisimcilik-destek-programi-bigg-yatirim",
      },
    ],
    related: [
      "firsat-radari-nedir",
      "hizlandirici-program-secimi",
      "startup-yatirim-haberleri",
    ],
    cta: {
      ...opportunities,
      title: "Duyuruları tek bir değerlendirme gündeminde toplayın",
      body: "Fırsat Radarı'nda ilgili destek türlerini seçin; keşfettiğiniz duyuruların resmî koşullarını ekipçe doğrulayın.",
    },
  },
  {
    slug: "startup-yatirim-haberleri",
    title: "Startup yatırım haberleri nasıl okunmalı?",
    category: "Girişimcilik",
    description:
      "Yatırım duyurularından sektör ve yatırımcı sinyalleri çıkarın. Tur, tarih, yatırım türü ve tekrarları doğru yorumlayın.",
    keywords: [
      "startup yatırım haberleri",
      "girişim yatırım takibi",
      "yatırımcı ekosistemi",
    ],
    answer:
      "Startup yatırım haberleri, hangi sektörlerin ve girişim türlerinin kamuya açık ilgi gördüğünü anlamaya yardımcı olur. Haber tutarı veya yatırımcı adı tek başına sizin girişiminize yatırım yapılacağını, fonun aktif başvuru kabul ettiğini veya bir değerlemeyi kanıtlamaz.",
    sections: [
      {
        title: "Duyurunun neyi anlattığını çözün",
        paragraphs: [
          "Hisse yatırımı, borç finansmanı, hibe ve satın alma farklı olaylardır. Haberde 'fon aldı' ifadesi geçmesi bunları eşitlemez. Tur adı, duyuru tarihi, para birimi ve varsa işlemin tamamlanma tarihi gibi alanları ayrı kaydedin.",
          "Kurgusal bir şirketin üç yayıncıda aynı turu duyurması üç yatırım olayı değildir. Tutar açıklanmamışsa tahmin üretmeyin; açıklanan tutarın bütün turu mu yoksa bir katılımcıyı mı anlattığını kontrol edin. Yalnız başlığa dayalı toplamlar pazar hakkında yanıltıcı bir resim oluşturabilir.",
        ],
      },
      {
        title: "Yatırımcı listesini araştırma listesine dönüştürün",
        paragraphs: [
          "Bir yatırımcının aynı sektörde görünmesi araştırmaya değer bir sinyaldir. Sonraki adım yatırımcının resmî sitesindeki aşama, coğrafya ve yatırım yaklaşımını incelemektir. Eski bir yatırım haberinden bugün açık başvuru veya uygun bilet büyüklüğü sonucu çıkarmayın.",
          "Ekip içinde yatırımcı, sektör, aşama, duyuru kaynağı ve araştırma notu alanları kullanabilirsiniz. Bu liste kişisel iletişim bilgisi toplama veya otomatik mesaj gönderme amacıyla değil, açık bilgiler üzerinden hedefli araştırma yapmak için düzenlenmelidir.",
        ],
      },
      {
        title: "Ekosistem gündemini kendi hikâyenizle bağlayın",
        paragraphs: [
          "Yeni yatırımlar müşterilerin hangi sorunlarına ilgi duyulduğunu gösterebilir. Fakat yalnız popüler kategoriye uyum sağlamak için ürün anlatısını değiştirmek yeterli değildir. Kendi müşteri kanıtınızı, ekip deneyiminizi ve ürün aşamanızı ayrı değerlendirin.",
          "Mediaory'de girişimcilik ve yatırım gündemini izleyerek araştırma için düzenli bir akış kurabilirsiniz. Fırsat Radarı'ndaki eşleşmeler de bu keşfi destekleyebilir. Bu içerik bir yatırım tavsiyesi veya fon seçimi değerlendirmesi değil, haberleri düzenli okumaya yönelik iş akışı rehberidir.",
        ],
      },
    ],
    checklist: [
      "Hisse, borç, hibe ve satın almayı ayırın.",
      "Tekrarlanan duyuruları aynı olayda gruplayın.",
      "Yatırımcı yaklaşımını resmî sitesinden kontrol edin.",
      "Haber sinyalini kendi müşteri kanıtınızla tamamlayın.",
    ],
    faq: [
      {
        question: "Sektörüme yatırım yapan fon kesin uygun mu?",
        answer:
          "Hayır. Aşama, coğrafya, yaklaşım ve güncel faaliyet ayrıca kontrol edilmelidir.",
      },
      {
        question: "Açıklanmayan yatırım tutarı tahmin edilmeli mi?",
        answer:
          "Doğrulanmış veri yoksa tutarı açıklanmadı olarak kaydedin. Tahmini kesin tutar gibi sunmayın.",
      },
    ],
    related: [
      "hizlandirici-program-secimi",
      "firsat-radari-nedir",
      "sektor-gundemi-takibi",
    ],
    cta: {
      ...opportunities,
      title: "Girişimcilik gündemini düzenli izleyin",
      body: "Fırsat Radarı'nda yatırım ve girişimcilik ilgi alanlarınızı belirleyip ilgili duyuruları araştırma listenize taşıyın.",
    },
  },
  {
    slug: "hizlandirici-program-secimi",
    title: "Hızlandırıcı program nasıl seçilir? Girişimler için kontrol listesi",
    category: "Girişimcilik",
    description:
      "Hızlandırıcı ve kuluçka programlarını aşama, sektör, zaman, ücret ve hak koşullarıyla değerlendirin. Başvuru öncesi doğru soruları sorun.",
    keywords: ["hızlandırıcı program", "kuluçka programı", "startup program seçimi"],
    answer:
      "Hızlandırıcı program seçerken girişimin aşaması ve ihtiyacıyla programın sunduğu destek ve yükümlülükleri karşılaştırın. Mentorluk, müşteri erişimi, yatırım bağlantıları, zaman yükü ve sözleşme koşulları birlikte değerlendirilmelidir; program adı tek başına uygunluğu göstermez.",
    sections: [
      {
        title: "Programdan beklediğiniz çıktıyı yazın",
        paragraphs: [
          "Müşteri doğrulaması yapmak isteyen bir ekip ile yatırım turuna hazırlanan ekip farklı destek arar. Beklentiyi 'gelişmek' gibi genel bir ifade yerine müşteri görüşmeleri, pilot anlaşma veya sunum hazırlığı gibi somut işlere dönüştürün.",
          "Kurgusal erken aşama bir ekip için sektör uzmanıyla görüşme ve müşteri erişimi, çok sayıda genel eğitimden daha öncelikli olabilir. Ürününü pazara sunmuş başka bir ekip ise dağıtım ortaklığı arayabilir. Bu ihtiyaç farkı aynı programın iki ekip için farklı değer taşımasını açıklar.",
        ],
      },
      {
        title: "Koşulları duyurudan değil belgeden okuyun",
        paragraphs: [
          "Programın süresi, katılım biçimi, ekipten beklediği zaman, coğrafya, ücret ve varsa hisse veya hak koşullarını resmî belgelerden kontrol edin. Haber özetleri bu ayrıntıları atlayabilir. Sözleşme şartları için gerekli uzman değerlendirmesini başvuru kararından ayrı planlayın.",
          "Mezun örneklerini inceleyebilirsiniz; ancak programın yayımladığı başarı hikâyelerini bütün katılımcılar için sonuç garantisi gibi yorumlamayın. Uygunsa mezunların deneyimlerini farklı kaynaklardan araştırın ve sorularınızı program ekibine yöneltin.",
        ],
      },
      {
        title: "Basit bir karşılaştırma tablosu kurun",
        paragraphs: [
          "İhtiyaç uyumu, sektör ağı, zaman yükü, maliyet ve koşul açıklığı gibi alanlara kendi önem sıralamanızı verin. Evrensel bir 'en iyi program' puanı üretmek yerine hangi koşulun sizin için eleme nedeni olduğunu yazın. Belirsiz bilgiye yüksek puan vermeyin.",
          "Mediaory Fırsat Radarı program duyurularını keşif listenize taşımak için kullanılabilir. Seçim ve başvuru kararında resmî takvim, koşullar ve ekibinizin kapasitesi belirleyicidir. Başvurudan önce aynı dönemdeki diğer programların iş yükünü de hesaba katın.",
        ],
      },
    ],
    checklist: [
      "Beklenen çıktıyı somutlaştırın.",
      "Aşama ve sektör uyumunu kontrol edin.",
      "Zaman, ücret ve hak koşullarını okuyun.",
      "Belirsiz alanları program ekibine sorun.",
    ],
    faq: [
      {
        question: "Kuluçka ve hızlandırıcı aynı mı?",
        answer:
          "İsimler programdan programa değişebilir. Etikete güvenmek yerine hedef aşama, süre, sunulan destek ve koşulları karşılaştırın.",
      },
      {
        question: "Ücretsiz görünen programın hiç maliyeti yok mu?",
        answer:
          "Katılım ücreti olmasa bile ekip zamanı, seyahat veya sözleşmesel yükümlülükler olabilir. Resmî koşulları kontrol edin.",
      },
    ],
    related: [
      "firsat-radari-nedir",
      "startup-yatirim-haberleri",
      "hibe-destek-cagrisi-takibi",
    ],
    cta: {
      ...opportunities,
      title: "Uygun programları keşfedin",
      body: "Fırsat Radarı'nda sektörünüzü ve girişim aşamanızı belirleyerek program araştırmasına düzenli bir başlangıç yapın.",
    },
  },
  {
    slug: "sektor-gundemi-takibi",
    title: "Sektör gündemi takibiyle içerik ve iş geliştirme planı",
    category: "Medya takibi",
    description:
      "Sektör haberlerini müşteri soruları, içerik fikirleri ve iş geliştirme aksiyonlarına dönüştürün. Haftalık gündem toplantısı için yöntem.",
    keywords: [
      "sektör gündemi takibi",
      "sektör haberleri",
      "iş geliştirme istihbaratı",
    ],
    answer:
      "Sektör gündemi takibi, markanızın adı geçmese bile müşterilerin ihtiyaçlarını ve pazarın kamuya açık değişimlerini izlemektir. Amaç her habere içerik üretmek değil, hangi gelişmenin müşteriniz ve ekibiniz için anlamlı olduğunu düzenli değerlendirmektir.",
    sections: [
      {
        title: "Gündemi müşteri sorularından kurun",
        paragraphs: [
          "Ürün kategorisi, müşteri problemi ve sektörün kullandığı terimleri ayrı listelere yazın. Yalnız teknik kavramları izlemek, müşterilerin gündelik dilde anlattığı ihtiyacı kaçırabilir. Satış ve destek ekiplerinden sık sorulan soruları toplamak iyi bir başlangıçtır.",
          "Kurgusal bir lojistik ekibi için teslimat süresi, operasyon maliyeti ve tedarik kesintisi farklı konu kümeleridir. Her kümede resmî duyurular, sektör yayınları ve ilgili marka haberleri farklı roller oynar. Kaynak çeşidi ve güncelliği değerlendirme notunda görünür olmalıdır.",
        ],
      },
      {
        title: "Haftalık toplantıda üç soru sorun",
        paragraphs: [
          "Ne değişti, müşterimiz neden ilgilenir ve biz hangi adımı atabiliriz? Bu üç soru haber listesini kısa bir gündeme dönüştürür. Bir gelişme yalnız ilginç ama işinizle ilgisizse bilgi olarak kalabilir; her haberden aksiyon çıkarmak zorunda değilsiniz.",
          "Resmî düzenleme veya destek koşulu içeren haberlerde asıl kuruma dönün. Bir yorum yazısı ile yürürlüğe giren değişiklik aynı kanıt değildir. Tarihi belirsiz içerikleri güncel gelişme gibi paylaşmamak içerik ekibinin güvenilirliğini korur.",
        ],
      },
      {
        title: "Gündemi yeniden kullanılabilir çıktılara çevirin",
        paragraphs: [
          "Bir müşteri sorusu blog yazısına, sektör değişimi satış notuna, yeni program duyurusu fırsat kartına dönüşebilir. Aynı gelişmeden farklı ekipler için farklı çıktılar üretin. İçerik planında yalnız anahtar kelimeyi değil, cevaplanacak soruyu ve ilgili ürün yolunu da yazın.",
          "Mediaory takiplerini sektör başlıkları için ayrı kurmak bu düzeni destekler. İlk ay hangi konu grubunun gerçekten karar ürettiğine bakın. Çok sayıda bildirim üreten ama hiçbir ekipte kullanılmayan bir kapsamı daraltmak, izleme kalitesini artırabilir.",
        ],
      },
    ],
    checklist: [
      "Müşteri sorunlarını ve sektör terimlerini ayırın.",
      "Gelişmenin tarihini ve ilk kaynağını doğrulayın.",
      "Her önemli bulguyu ilgili ekibe bağlayın.",
      "Kullanılmayan takip kapsamlarını gözden geçirin.",
    ],
    faq: [
      {
        question: "Markamız geçmeyen haberler neden önemli?",
        answer:
          "Müşteri ihtiyacı, düzenleme, rakip hamlesi veya yeni fırsat markanız anılmadan da iş kararınızı etkileyebilir.",
      },
      {
        question: "Her gündem için blog yazılmalı mı?",
        answer:
          "Hayır. İçeriğin hedef okuyucuya yararı ve kurumunuzun katkısı yoksa yalnız gündem olduğu için yazmak değer üretmeyebilir.",
      },
    ],
    related: [
      "rakip-analizi-medya",
      "seo-geo-icerik-stratejisi",
      "firsat-radari-nedir",
    ],
    cta: {
      ...features,
      title: "Markanın ötesindeki gündemi izleyin",
      body: "Mediaory ile sektör ve müşteri problemi takiplerini ayrı kurarak içerik ve iş geliştirme toplantılarını besleyin.",
    },
  },
  {
    slug: "sosyal-medya-dinleme",
    title: "Sosyal medya dinleme ile medya takibi arasındaki fark",
    category: "Dijital görünürlük",
    description:
      "Haber takibi ile sosyal medya dinlemeyi doğru kapsamda kullanın. Platform erişimi, resmî entegrasyonlar ve eksik veri için kontrol noktaları.",
    keywords: ["sosyal medya dinleme", "social listening", "sosyal medya takibi"],
    answer:
      "Medya takibi yayıncı içeriklerini; sosyal medya dinleme ise erişim izni olan platform konuşmalarını ve hesap içeriklerini izlemeye odaklanır. Kapsam kullanılan kaynağa, hesaba ve platformun erişim koşullarına bağlıdır. Hiçbir platform listesi tek başına eksiksiz kapsama kanıtı değildir.",
    sections: [
      {
        title: "İki veri türü farklı soruları cevaplar",
        paragraphs: [
          "Bir haber markanın kamuya açık anlatısını gösterebilir; bir sosyal paylaşım ise deneyim, tepki veya tartışma sinyali olabilir. Haber adedi ile sosyal etkileşim adedini aynı toplamda sunmak ölçümün anlamını belirsizleştirir. Kanalları ayrı okuyup olay düzeyinde birlikte değerlendirin.",
          "Aynı açıklama haberlerde ve sosyal ağlarda dolaşabilir. Haberin yayıncı bağlantısı ile paylaşımın platform bağlantısını korumak, hangi iddianın nereden geldiğini ayırt etmeyi sağlar. Platformdaki görünür etkileşim bir haberin gerçek okur sayısını kanıtlamaz.",
        ],
      },
      {
        title: "Platform kapsamını açıkça kontrol edin",
        paragraphs: [
          "Instagram, X, Reddit, LinkedIn, YouTube ve Facebook aynı veri erişim modeline sahip değildir. Kamuya açık sayfa, bağlanan hesap ve resmî API farklı kapsama sahip olabilir. Erişim koşulları değişebileceği için platformun güncel resmî belgeleri ve hesabınıza verilen izinler esas alınmalıdır.",
          "Mediaory'de gördüğünüz kaynak veya bağlantı durumunu kontrol edin; bir platform adının arayüzde bulunmasını platformun tüm içeriğinin izlenmesi gibi yorumlamayın. Bu yazı bütün sosyal ağların üretimde eksiksiz toplandığını iddia etmez. Eksik kapsama, raporun yöntem notunda açıkça belirtilmelidir.",
        ],
      },
      {
        title: "Dinlemeyi küçük bir karar alanıyla başlatın",
        paragraphs: [
          "Önce bir ürün, kampanya veya müşteri problemi seçin. Hangi içeriklerin inceleneceğini, nasıl saklanacağını ve kimlerin erişeceğini belirleyin. Özel hesapları veya kapalı toplulukları kamuya açık veri gibi ele almayın; gereksiz kişisel veri toplamaktan kaçının.",
          "Günlük değerlendirmede iddianın kaynağına, güncelliğine ve bağlamına bakın. Otomatik toplama veya duygu etiketi insan kontrolünün yerini tutmaz. Haber ve sosyal kaynakları ortak bir olay notunda birleştirmek, kanalların farklı sınırlamalarını koruyarak daha anlaşılır bir gündem sunar.",
        ],
      },
    ],
    checklist: [
      "Haber ve sosyal etkileşim metriklerini ayırın.",
      "Platform ve hesap erişim kapsamını doğrulayın.",
      "Eksik veri kapsamını rapora yazın.",
      "Özel içerik ve gereksiz kişisel veriyi toplamayın.",
    ],
    faq: [
      {
        question: "Herkese açık hesap tüm içeriklerin alınabileceği anlamına gelir mi?",
        answer:
          "Hayır. Platformun erişim koşulları, resmî entegrasyon ve izin kapsamı ayrıca belirleyicidir.",
      },
      {
        question: "Mediaory bütün sosyal ağları eksiksiz tarıyor mu?",
        answer:
          "Bu blog böyle bir kapsama garantisi vermez. Mevcut kaynak ve bağlantı durumunu ürün içinde kontrol edin; platform bazındaki erişim sınırlarını değerlendirin.",
      },
    ],
    related: [
      "rss-ile-haber-takibi",
      "duygu-analizi-sinirlari",
      "kriz-iletisimi-erken-uyari",
    ],
    cta: {
      ...features,
      title: "Kapsamı bilerek izleme planı kurun",
      body: "Mediaory'nin mevcut izleme özelliklerini inceleyin; sosyal kaynakları erişim ve izin durumlarıyla birlikte değerlendirin.",
    },
  },
  {
    slug: "seo-geo-icerik-stratejisi",
    title: "SEO ve GEO için içerik stratejisi: Açık cevap, güçlü bağlam",
    category: "Dijital görünürlük",
    description:
      "SEO ve üretken arama görünürlüğü için soru odaklı içerik planı kurun. Açık cevaplar, kaynaklar, iç bağlantılar ve ölçüm adımları.",
    keywords: ["SEO GEO", "GEO içerik stratejisi", "üretken arama optimizasyonu"],
    answer:
      "SEO, içeriğin arama motorlarınca anlaşılmasını ve bulunmasını destekler. GEO ise üretken yanıt sistemlerinde görünür olma hedefi için kullanılan bir terimdir. Açık cevaplar, doğrulanabilir bilgiler ve teknik olarak erişilebilir sayfalar ortak temeldir; hiçbir yöntem sıralama veya yapay zekâ yanıtında alıntılanma garantisi vermez.",
    sections: [
      {
        title: "Anahtar kelimeden önce kullanıcı sorusunu seçin",
        paragraphs: [
          "'Medya takibi' geniş bir konu; 'aynı haber neden tekrar gelir?' ise belirli bir sorudur. İçerik planında her yazıya tek ana soru verin. Yakın soruları ilgili yazılarla bağlamak, aynı konuyu farklı sayfalarda tekrar tekrar anlatmaktan daha yararlı bir bilgi yapısı oluşturur.",
          "Bir yazının girişinde kısa ve açık cevap, devamında örnek ve sınırlar bulunsun. Kavramları yalnız sloganlarla anlatmak yerine okuyucunun uygulayabileceği adımları gösterin. Örnekler kurgusalsa bunu belirtin; doğrulanmamış başarı oranı veya müşteri sonucu eklemeyin.",
        ],
      },
      {
        title: "Teknik yapıyı görünen içerikle eşleştirin",
        paragraphs: [
          "Google'ın resmî rehberi, AI Overviews ve AI Mode için temel SEO uygulamalarının geçerli olduğunu ve özel bir AI dosyası ya da ayrı şema gerektirmediğini belirtir. Metnin erişilebilir olması, iç bağlantılar ve görünen içerikle uyumlu yapılandırılmış veri önemlidir; uygunluk gösterim garantisi değildir.",
          "Sayfanın başlığı, açıklaması, kanonik adresi, kapak bilgisi ve yayın tarihi tutarlı olsun. Yazı şeması, sayfada bulunmayan yazar veya başarı iddiası üretmemelidir. Sık sorulan soruları okuyucuya yardımcı olduğu için ekleyin; özel arama görünümü garantisi gibi sunmayın.",
        ],
      },
      {
        title: "Görünürlüğü doğru aksiyonla değerlendirin",
        paragraphs: [
          "Bir blogun amacı yalnız ziyaret artırmak değil, doğru kişiyi bir sonraki yararlı adıma taşımaktır. Medya takibi yazısı özelliklere, fırsat keşfi yazısı Fırsat Radarı'na bağlanabilir. Bağlantı okuyucunun o anda çözmek istediği sorunla ilgili olmalıdır.",
          "Mediaory'nin sektör takibi içerik fikirlerini besleyebilir; sitenizin arama ve dönüşüm ölçümü ayrı verilerle yapılır. Gösterim, tıklama ve kayıt tamamlamayı farklı göstergeler olarak izleyin. Bir yazı yayımlanır yayımlanmaz yüksek trafik beklemek yerine sorgu, indeksleme ve kullanıcı aksiyonlarını zaman içinde değerlendirin.",
        ],
      },
    ],
    checklist: [
      "Her yazıya tek bir ana kullanıcı sorusu verin.",
      "Kısa cevap, örnek ve sınırları birlikte yazın.",
      "Görünen içerikle metadata ve şemayı eşleştirin.",
      "İlgili hizmete doğal bir sonraki adım ekleyin.",
    ],
    faq: [
      {
        question: "GEO için özel bir dosya zorunlu mu?",
        answer:
          "Google, kendi AI arama özellikleri için özel bir AI metin dosyası gerekmediğini belirtir. Diğer sistemlerin davranışı farklı olabilir; görünürlük garanti değildir.",
      },
      {
        question: "On beş yazı yayınlamak trafik garantisi verir mi?",
        answer:
          "Hayır. İçeriğin yararı, teknik erişim, rekabet ve kullanıcı ihtiyacı birlikte etkilidir. Sonuçlar ölçülerek değerlendirilmelidir.",
      },
    ],
    sources: [google],
    related: ["sektor-gundemi-takibi", "pr-kpi-olcumu", "medya-takibi-nedir"],
    cta: {
      ...features,
      title: "İçerik planınızı gerçek gündemle besleyin",
      body: "Mediaory ile sektör ve marka gündemini izleyerek hedef kitlenizin sorularına bağlanan bir içerik planı oluşturun.",
    },
  },
];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}
export function blogCover(post: BlogPost) {
  return `/blog/covers/${post.slug}.png`;
}
export function readingMinutes(post: BlogPost) {
  const words = [
    post.answer,
    ...post.sections.flatMap((section) => section.paragraphs),
    ...post.checklist,
    ...post.faq.map((item) => item.answer),
  ]
    .join(" ")
    .split(/\s+/).length;
  return Math.max(2, Math.ceil(words / 180));
}
export function blogJsonLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        image: `${BLOG_ORIGIN}${blogCover(post)}`,
        datePublished: BLOG_DATE,
        dateModified: BLOG_DATE,
        inLanguage: "tr-TR",
        author: {
          "@type": "Organization",
          name: BLOG_AUTHOR,
          url: `${BLOG_ORIGIN}/blog`,
        },
        publisher: { "@type": "Organization", name: "Mediaory", url: BLOG_ORIGIN },
        mainEntityOfPage: `${BLOG_ORIGIN}/blog/${post.slug}`,
        articleSection: post.category,
        keywords: post.keywords.join(", "),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Ana sayfa", item: BLOG_ORIGIN },
          {
            "@type": "ListItem",
            position: 2,
            name: "Blog",
            item: `${BLOG_ORIGIN}/blog`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: `${BLOG_ORIGIN}/blog/${post.slug}`,
          },
        ],
      },
    ],
  };
}
