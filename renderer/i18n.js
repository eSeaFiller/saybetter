'use strict';

(() => {
  const strings = {
    more: ['更多', 'More', 'Plus'],
    interfaceLanguage: ['界面语言', 'Interface language', 'Langue de l’interface'],
    settings: ['API 与模型', 'API and model', 'API et modèle'],
    settingsHint: ['更换 Key 与模型', 'Change key and model', 'Modifier la clé et le modèle'],
    favoritesExport: ['收藏与导出', 'Favorites and export', 'Favoris et exportation'],
    favoritesHint: ['管理本地收藏', 'Manage local favorites', 'Gérer les favoris locaux'],
    targetLanguage: ['目标语言', 'Target language', 'Langue cible'],
    autoTranslate: ['检测源语言后翻译', 'Detect the source language', 'Détecter la langue source'],
    language_en: ['英语', 'English', 'anglais'],
    language_fr: ['法语', 'French', 'français'],
    language_de: ['德语', 'German', 'allemand'],
    language_ja: ['日语', 'Japanese', 'japonais'],
    switchAppearance: ['切换外观', 'Switch appearance', 'Changer l’apparence'],
    appearance: ['外观', 'Appearance', 'Apparence'],
    appearance_system: ['跟随系统', 'System', 'Système'],
    appearance_light: ['浅色', 'Light', 'Clair'],
    appearance_dark: ['深色', 'Dark', 'Sombre'],
    about: ['关于应用', 'About', 'À propos'],
    aboutHint: ['版本与说明', 'Version and information', 'Version et informations'],
    feedback: ['问题反馈', 'Send feedback', 'Donner mon avis'],
    email: ['发送邮件', 'Send an email', 'Envoyer un e-mail'],
    introSample: ['让每句话都更自然。', 'Make every sentence sound natural.', 'Trouvez des mots qui sonnent juste.'],
    introEyebrow: ['专注表达', 'A quieter way to write', 'Écrire sans perdre le fil'],
    introTitle: ['说得更自然，不离开当前思路。', 'Sound more natural without losing your train of thought.', 'Écrivez plus naturellement, sans perdre le fil.'],
    introLead: ['从菜单栏打开 Saybetter-A lingoisland，获得四种表达与一份可复习的句法拆解。所有收藏留在这台 Mac。', 'Open Saybetter-A lingoisland from the menu bar for four rewrites and a sentence breakdown you can review. Favorites stay on this Mac.', 'Ouvrez Saybetter-A lingoisland depuis la barre des menus pour obtenir quatre reformulations et une analyse de la phrase. Vos favoris restent sur ce Mac.'],
    fiveModes: ['五种模式', 'Five modes', 'Cinq modes'],
    fiveModesHint: ['默认、正式、口语、简洁、学习', 'Default, formal, casual, concise, learning', 'Standard, formel, courant, concis, apprentissage'],
    localFavorites: ['本地收藏', 'Local favorites', 'Favoris locaux'],
    localFavoritesHint: ['收藏单词和语句，随时导出', 'Save words and phrases and export them anytime', 'Enregistrez et exportez vos mots et phrases'],
    chooseModel: ['自选模型', 'Choose your model', 'Modèle au choix'],
    chooseModelHint: ['兼容主流 AI API 与本地模型', 'Supports popular AI APIs and local models', 'Compatible avec les API d’IA et les modèles locaux'],
    start: ['开始使用', 'Get started', 'Commencer'],
    configureApi: ['先配置 API', 'Set up API', 'Configurer l’API'],
    translationLanguage: ['翻译语言', 'Translation language', 'Langue de traduction'],
    detectLanguage: ['检测语言', 'Auto-detect', 'Détection auto'],
    expressionModes: ['表达模式', 'Writing modes', 'Modes de rédaction'],
    mode_default: ['默认', 'Default', 'Standard'],
    mode_formal: ['正式', 'Formal', 'Formel'],
    mode_casual: ['口语', 'Casual', 'Courant'],
    mode_concise: ['简洁', 'Concise', 'Concis'],
    mode_learning: ['学习', 'Learning', 'Apprentissage'],
    mode_custom: ['自定义', 'Custom', 'Personnalisé'],
    customPrompt: ['给 AI 的 Prompt', 'Custom AI prompt', 'Consigne pour l’IA'],
    customExample: ['例如：将内容改写成友好、专业的客户邮件，并保留所有事实和数字。', 'For example: Rewrite this as a friendly, professional email and keep all facts and figures.', 'Par exemple : reformulez ce texte en e-mail professionnel et cordial, en conservant tous les faits et chiffres.'],
    customHint: ['该 Prompt 只作为处理规则，待处理文本中的指令不会覆盖它。', 'Instructions in the text you submit cannot override this prompt.', 'Les instructions du texte à traiter ne peuvent pas remplacer cette consigne.'],
    inputPlaceholder: ['输入或粘贴一句话…', 'Type or paste a sentence…', 'Saisissez ou collez une phrase…'],
    generate: ['生成', 'Generate', 'Générer'],
    emptyTitle: ['更好的表达会出现在这里', 'Your rewrites will appear here', 'Vos reformulations s’afficheront ici'],
    emptyDetail: ['选择一种模式，然后输入内容。', 'Choose a mode and enter some text.', 'Choisissez un mode, puis saisissez du texte.'],
    detail_learning: ['学习模式会拆解主谓宾，并检索可核验的{target}新闻标题原文。', 'Learning mode identifies the subject, verb and object and looks for verifiable headlines in {target}.', 'Le mode Apprentissage repère le sujet, le verbe et le complément d’objet, puis recherche des titres de presse vérifiables en {target}.'],
    detail_custom: ['自定义模式会按你的 Prompt 处理，并默认输出{target}。', 'Custom mode follows your prompt and writes in {target} by default.', 'Le mode Personnalisé suit votre consigne et répond en {target} par défaut.'],
    detail_compare: ['输出{target}，并用橙色标出不同表达。', 'Generate text in {target} and highlight wording changes in orange.', 'Le résultat est en {target}. Les changements de formulation apparaissent en orange.'],
    detail_default: ['自动检测源语言并输出{target}。', 'Detect the source language and generate text in {target}.', 'La langue source est détectée automatiquement. Le résultat est en {target}.'],
    loading: ['正在组织表达…', 'Generating rewrites…', 'Reformulation en cours…'],
    loadingLearning: ['正在生成五种表达并拆解句式…', 'Generating five versions and analyzing the sentence…', 'Création de cinq versions et analyse de la phrase…'],
    loadingBundle: ['正在生成五种表达…', 'Generating five versions…', 'Création de cinq versions…'],
    loadingCustom: ['正在应用自定义 Prompt…', 'Applying your custom prompt…', 'Application de votre consigne…'],
    pendingMode: ['正在生成该模式的结果…', 'Generating this version…', 'Création de cette version…'],
    working: ['生成中…', 'Generating…', 'Génération en cours…'],
    newsHeading: ['报刊中的自然表达', 'Wording in the news', 'Exemples dans la presse'],
    newsHint: ['公开标题原文，可点击核验', 'Open the original headlines to verify them', 'Ouvrez les titres d’origine pour vérifier la source'],
    noNews: ['暂未找到匹配且可核验的公开新闻标题。', 'No matching, verifiable headlines found.', 'Aucun titre de presse pertinent et vérifiable n’a été trouvé.'],
    newsSource: ['公开新闻来源', 'Public news source', 'Source de presse publique'],
    copy: ['复制', 'Copy', 'Copier'],
    copyResult: ['复制结果', 'Copy result', 'Copier le résultat'],
    copied: ['已复制', 'Copied', 'Copié'],
    favorite: ['收藏', 'Save', 'Enregistrer'],
    favoriteSaved: ['已收藏', 'Saved', 'Enregistré'],
    savedLocally: ['已收藏到本机', 'Saved to this Mac', 'Enregistré sur ce Mac'],
    modelEyebrow: ['模型', 'Model', 'Modèle'],
    keyPrivacy: ['Key 经过系统安全存储加密，仅保存在本机。', 'Your key is encrypted using system storage and stays on this Mac.', 'Votre clé est chiffrée par le système et reste sur ce Mac.'],
    provider: ['服务商', 'Provider', 'Fournisseur'],
    apiUrl: ['API 地址', 'API URL', 'Adresse de l’API'],
    defaultApiUrl: ['留空使用默认地址', 'Leave blank for the default URL', 'Laissez vide pour utiliser l’adresse par défaut'],
    model: ['模型', 'Model', 'Modèle'],
    apiKey: ['API Key', 'API key', 'Clé API'],
    keyPlaceholder: ['粘贴新的 Key 或保留当前值', 'Paste a new key or keep the current one', 'Collez une nouvelle clé ou gardez la clé actuelle'],
    cancel: ['取消', 'Cancel', 'Annuler'],
    saveSettings: ['保存设置', 'Save settings', 'Enregistrer les réglages'],
    settingsSaved: ['已保存', 'Settings saved', 'Réglages enregistrés'],
    library: ['资料库', 'Library', 'Bibliothèque'],
    favorites: ['收藏', 'Favorites', 'Favoris'],
    favoritesLocal: ['保存在本机，可导出为 CSV。', 'Stored on this Mac and exportable as CSV.', 'Conservés sur ce Mac et exportables au format CSV.'],
    export: ['导出', 'Export', 'Exporter'],
    exportFavorites: ['导出收藏', 'Export favorites', 'Exporter les favoris'],
    exported: ['已导出', 'Exported', 'Exporté'],
    favoritesExported: ['收藏已导出', 'Favorites exported', 'Favoris exportés'],
    back: ['返回翻译', 'Back to writing', 'Retour à la rédaction'],
    noFavorites: ['还没有收藏。生成结果后点“收藏”即可加入。', 'No favorites yet. Click Save on a result to add it.', 'Aucun favori. Cliquez sur Enregistrer pour ajouter un résultat.'],
    original: ['原文', 'Original', 'Original'],
    delete: ['删除', 'Delete', 'Supprimer'],
    version: ['版本 {version}', 'Version {version}', 'Version {version}'],
    aboutCopy: ['一个驻留菜单栏的语言表达与学习工具。应用不会向作者上传分析数据；你的 API Key 和收藏均留在本机。', 'A menu bar tool for writing and language learning. No analytics are sent to the developer. Your API key and favorites stay on this Mac.', 'Un outil de rédaction et d’apprentissage dans la barre des menus. Aucune donnée d’analyse n’est envoyée à l’auteur. Votre clé API et vos favoris restent sur ce Mac.'],
    license: ['版权与许可', 'Copyright and license', 'Droits d’auteur et licence'],
    licenseCopy: ['基于 eSeaFiller/lingoisland 开源项目继续开发，上游代码采用 MIT License。第三方模型服务由相应提供商独立运营。', 'Based on the open-source eSeaFiller/lingoisland project, released under the MIT License. Each provider runs its own model service.', 'Basé sur le projet libre eSeaFiller/lingoisland, distribué sous licence MIT. Chaque fournisseur exploite son propre service de modèles.'],
    upstream: ['查看上游项目', 'View upstream project', 'Voir le projet d’origine'],
    done: ['完成', 'Done', 'Terminé'],
    learningDone: ['学习解析完成，未找到匹配来源', 'Analysis complete. No matching sources found.', 'Analyse terminée. Aucune source correspondante trouvée.'],
    close: ['关闭', 'Close', 'Fermer'],
    promptPlaceholder: ['输入你的 AI Prompt…', 'Enter your AI prompt…', 'Saisissez votre consigne…'],
    apply: ['应用', 'Apply', 'Appliquer'],
    customRequired: ['请先填写自定义 Prompt', 'Enter a custom prompt first', 'Saisissez d’abord une consigne personnalisée'],
    textRequired: ['请输入要处理的内容', 'Enter some text to process', 'Saisissez un texte à traiter'],
    requestFailed: ['请求失败', 'Request failed', 'La requête a échoué'],
    generationFailed: ['无法生成', 'Could not generate a result', 'Impossible de générer un résultat'],
    checkSettings: ['请检查 API 设置', 'Check your API settings', 'Vérifiez les réglages de l’API'],
    urlRequired: ['请填写 API 地址', 'Enter the API URL', 'Saisissez l’adresse de l’API'],
    modelRequired: ['请填写模型名称', 'Enter a model name', 'Saisissez le nom du modèle'],
    keyRequired: ['请填写 API Key', 'Enter an API key', 'Saisissez une clé API'],
    responseMissing: ['服务商未返回可读取的响应', 'The provider returned no readable response', 'Le fournisseur a renvoyé une réponse illisible'],
    outputEmpty: ['模型返回了空内容，请尝试关闭思考模式或更换模型', 'The model returned no text. Try turning off reasoning or choosing another model.', 'Le modèle n’a renvoyé aucun texte. Essayez de désactiver le raisonnement ou de changer de modèle.'],
    provider_qwen: ['通义千问', 'Qwen', 'Qwen'],
    provider_zhipu: ['智谱 GLM', 'Zhipu GLM', 'Zhipu GLM'],
    provider_ark: ['豆包 / 火山方舟', 'Doubao / Volcano Ark', 'Doubao / Volcano Ark'],
    provider_ollama: ['Ollama 本地', 'Ollama (local)', 'Ollama (local)'],
    provider_custom: ['自定义 OpenAI 兼容接口', 'Custom OpenAI-compatible API', 'API compatible OpenAI personnalisée'],
    hint_moonshot: ['platform.kimi.com（原 platform.moonshot.cn，key 通用）', 'platform.kimi.com (keys from platform.moonshot.cn still work)', 'platform.kimi.com (les clés de platform.moonshot.cn restent valides)'],
    hint_qwen: ['阿里云百炼控制台', 'Alibaba Cloud Model Studio console', 'Console Alibaba Cloud Model Studio'],
    hint_ark: ['填写模型 ID 或接入点 ID', 'Enter a model or endpoint ID', 'Saisissez l’identifiant du modèle ou du point d’accès'],
    hint_ollama: ['本地运行，无需 API Key', 'Runs locally without an API key', 'Fonctionne en local sans clé API'],
    hint_custom: ['填写以 /v1 结尾的 Base URL', 'Enter a base URL ending in /v1', 'Saisissez une adresse de base se terminant par /v1'],
    headingRewrite: ['优化表达', 'Suggested wording', 'Reformulation proposée'],
    headingChanges: ['修改说明', 'What changed', 'Modifications'],
    headingContext: ['使用场景', 'When to use it', 'Contexte d’utilisation'],
    headingGrammar: ['句子骨架', 'Sentence structure', 'Structure de la phrase'],
    headingColor: ['彩色结构', 'Color-coded structure', 'Structure en couleurs'],
    headingPath: ['结构路径', 'Sentence outline', 'Schéma de la phrase'],
    headingNatural: ['自然表达', 'Natural wording', 'Formulation naturelle'],
    headingWhy: ['为什么自然', 'Why it sounds natural', 'Pourquoi cette formulation est naturelle'],
    headingNews: ['报刊检索词', 'News search terms', 'Mots-clés pour la presse'],
    subject: ['主语（Subject）', 'Subject', 'Sujet'],
    predicate: ['谓语（Predicate）', 'Predicate', 'Prédicat'],
    object: ['宾语（Object）', 'Object', 'Complément d’objet'],
    complement: ['补充成分', 'Other elements', 'Autres éléments'],
    implied: ['省略/隐含', 'omitted or implied', 'omis ou sous-entendu'],
    none: ['无', 'none', 'aucun'],
  };

  const languages = ['zh', 'en', 'fr'];

  function normalizeLanguage(value) {
    return languages.includes(value) ? value : 'zh';
  }

  function translate(language, key, values = {}, fallback = key) {
    const index = languages.indexOf(normalizeLanguage(language));
    const template = Object.hasOwn(strings, key) ? strings[key][index] : fallback;
    return template.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  }

  function matchesHeading(heading, key) {
    return Object.hasOwn(strings, key) && strings[key].some((label) => heading.includes(label));
  }

  if (typeof module === 'object') {
    module.exports = { translate, normalizeLanguage };
  } else {
    let language = 'zh';
    const t = (key, values, fallback) => translate(language, key, values, fallback);

    function setLanguage(value) {
      language = normalizeLanguage(value);
      document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
      document.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-label], [data-i18n-placeholder]').forEach((element) => {
        const { i18n, i18nTitle, i18nLabel, i18nPlaceholder } = element.dataset;
        if (i18n) element.textContent = t(i18n);
        if (i18nTitle) element.title = t(i18nTitle);
        if (i18nLabel) element.setAttribute('aria-label', t(i18nLabel));
        if (i18nPlaceholder) element.placeholder = t(i18nPlaceholder);
      });
    }

    function setText(element, key) {
      element.dataset.i18n = key;
      element.textContent = t(key);
    }

    window.i18n = { t, setLanguage, setText, matchesHeading };
  }
})();
