(function () {
  "use strict";

  const ROLE_LABEL = {
    question: { kn: "ಪ್ರಶ್ನೆ ಕರ್ತ", en: "Inquirer" },
    answer: { kn: "ಉತ್ತರ", en: "Answer" },
    note: { kn: "ಟಿಪ್ಪಣಿ", en: "Note" },
    misc: { kn: "ವಿವಿಧ", en: "Misc" },
  };

  const state = {
    data: null,
    messages: [],
    byId: new Map(),
    refsTo: new Map(),
    lang: "all",
    topic: "all",
  };

  const chatEl = document.getElementById("faq-chat");
  const topicListEl = document.getElementById("faq-topic-list");
  const langSelect = document.getElementById("lang-filter");
  const topicSelect = document.getElementById("topic-filter");
  const printBtn = document.getElementById("print-btn");

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function linkify(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  function messageText(message) {
    return message.text.join("\n\n");
  }

  function renderBodyText(message) {
    const raw = messageText(message);
    const withLinks = linkify(raw);
    // preserve paragraphs / line breaks
    return withLinks.replace(/\n\n/g, "<p></p>").replace(/\n/g, "<br>");
  }

  function displayRef(index) {
    return String(index + 1);
  }

  function roleLabel(message) {
    const labels = ROLE_LABEL[message.role] || ROLE_LABEL.note;
    return labels[message.lang] || labels.en;
  }

  function isIncoming(message) {
    return message.role === "question";
  }

  function buildBackrefs() {
    state.refsTo = new Map();
    state.messages.forEach((message) => {
      if (!message.replyTo) return;
      if (!state.refsTo.has(message.replyTo)) {
        state.refsTo.set(message.replyTo, []);
      }
      state.refsTo.get(message.replyTo).push(message.id);
    });
  }

  function renderTopics() {
    const topics = new Map();
    state.messages.forEach((message) => {
      (message.topics || []).forEach((topic) => {
        if (!topics.has(topic)) topics.set(topic, 0);
        if (message.role === "question") topics.set(topic, topics.get(topic) + 1);
      });
    });

    const sorted = [...topics.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    topicListEl.innerHTML = "";
    topicSelect.innerHTML = '<option value="all">All topics</option>';

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.textContent = "All topics";
    allBtn.className = state.topic === "all" ? "active" : "";
    allBtn.addEventListener("click", () => {
      state.topic = "all";
      topicSelect.value = "all";
      renderTopics();
      renderMessages();
    });
    topicListEl.appendChild(allBtn);

    sorted.forEach(([topic, count]) => {
      const item = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = topic.replace(/-/g, " ") + (count ? ` (${count})` : "");
      btn.className = state.topic === topic ? "active" : "";
      btn.addEventListener("click", () => {
        state.topic = topic;
        topicSelect.value = topic;
        renderTopics();
        renderMessages();
      });
      item.appendChild(btn);
      topicListEl.appendChild(item);

      const option = document.createElement("option");
      option.value = topic;
      option.textContent = topic.replace(/-/g, " ");
      topicSelect.appendChild(option);
    });
  }

  function shouldShow(message) {
    if (state.lang !== "all" && message.lang !== state.lang) return false;
    if (state.topic !== "all" && !(message.topics || []).includes(state.topic)) {
      return false;
    }
    // Hide messages that are just the document title/metadata
    if (state.data) {
      const title = state.data.title || "";
      const titleEn = state.data.titleEn || "";
      const txt = messageText(message).trim();
      if (!txt && !(message.urls || []).length) return false;
      if (txt === title || txt === titleEn) return false;
    }
    return true;
  }

  function renderMessages() {
    chatEl.innerHTML = "";
    state.messages.forEach((message, index) => {
      const parent = message.replyTo ? state.byId.get(message.replyTo) : null;
      const backrefs = state.refsTo.get(message.id) || [];

      const row = document.createElement("article");
      row.className = "message " + (isIncoming(message) ? "incoming" : "outgoing");
      row.id = "msg-" + message.id;
      row.dataset.messageId = message.id;
      if (!shouldShow(message)) row.classList.add("hidden");

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      if (message.role === "note" || message.role === "misc") {
        row.classList.add("note");
        if (message.role === "misc") row.classList.add("misc");
      }

      const meta = document.createElement("div");
      meta.className = "bubble-meta";
      meta.innerHTML =
        '<span class="ref">' +
        escapeHtml(displayRef(index)) +
        '</span><span class="role">' +
        escapeHtml(roleLabel(message)) +
        "</span>";
      bubble.appendChild(meta);

      if (parent) {
        const quote = document.createElement("button");
        quote.type = "button";
        quote.className = "reply-quote";
        const parentText = messageText(parent).trim();
        const excerpt =
          message.replyExcerpt ||
          (parentText.length > 140 ? parentText.slice(0, 140) + "…" : parentText);
        quote.textContent = excerpt;
        const parentIndex = state.messages.indexOf(parent);
        quote.dataset.printRef = displayRef(parentIndex);
        quote.addEventListener("click", () => scrollToMessage(parent.id));
        bubble.appendChild(quote);
      }

      const body = document.createElement("div");
      body.className = "bubble-text";
      body.innerHTML = renderBodyText(message);
      bubble.appendChild(body);

      // Render inline images if any URLs look like images
      if (message.urls && message.urls.length) {
        const imgs = document.createElement("div");
        imgs.className = "bubble-images";
        message.urls.forEach((u) => {
          try {
            const low = String(u).toLowerCase();
            if (low.endsWith(".png") || low.endsWith(".jpg") || low.endsWith(".jpeg") || low.endsWith(".gif") || low.includes('/images/')) {
              const im = document.createElement("img");
              im.src = u;
              im.alt = "image";
              imgs.appendChild(im);
            }
          } catch (e) {
            // ignore malformed urls
          }
        });
        if (imgs.children.length) bubble.appendChild(imgs);
      }

      if (backrefs.length) {
        const back = document.createElement("div");
        back.className = "backrefs";
        back.textContent = "Referenced later: ";
        backrefs.forEach((id, i) => {
          if (i) back.appendChild(document.createTextNode(", "));
          const btn = document.createElement("button");
          btn.type = "button";
          const target = state.byId.get(id);
          const targetIndex = state.messages.indexOf(target);
          btn.textContent = "#" + displayRef(targetIndex);
          btn.addEventListener("click", () => scrollToMessage(id));
          back.appendChild(btn);
        });
        bubble.appendChild(back);
      }

      row.appendChild(bubble);
      chatEl.appendChild(row);
    });
  }

  function scrollToMessage(id) {
    const el = document.getElementById("msg-" + id);
    if (!el) return;
    el.classList.add("highlight");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => el.classList.remove("highlight"), 1800);
  }

  function bindControls() {
    langSelect.addEventListener("change", () => {
      state.lang = langSelect.value;
      renderMessages();
    });
    topicSelect.addEventListener("change", () => {
      state.topic = topicSelect.value;
      renderTopics();
      renderMessages();
    });
    printBtn.addEventListener("click", () => window.print());
  }

  async function init() {
    bindControls();
    try {
      const response = await fetch("messages.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Could not load messages.json");
      state.data = await response.json();
      state.messages = state.data.messages || [];
      state.messages.forEach((message) => state.byId.set(message.id, message));
      buildBackrefs();
      renderTopics();
      renderMessages();
    } catch (error) {
      chatEl.innerHTML =
        '<p class="faq-status">Failed to load FAQ data. Run <code>python3 scripts/parse-pooja-faq.py</code> and refresh.</p>';
      console.error(error);
    }
  }

  init();
})();
