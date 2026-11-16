/**
 * AI 文风检测器 — Client half.
 *
 * A right-sidebar tab type plus its body. Everything is computed by a local
 * rule engine: no network, no API key, no host service. The only persisted
 * state is plugin-owned localStorage (draft + detection history), which is
 * profile-wide and therefore independent of the session-scoped tab layout.
 */
window.__ModuleLoader__.load({
  id: "dsh-style-detector",
  factory: function (require) {
    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useRef = React.useRef;

    var PACKAGE = "dsh-style-detector";
    var TAB_KIND = "style-detector";
    var TAB_TITLE = "AI 文风检测";
    var DRAFT_KEY = "dsh.style-detector.draft.v1";
    var HISTORY_KEY = "dsh.style-detector.history.v1";
    var AUTO_KEY = "dsh.style-detector.auto.v1";
    var HISTORY_LIMIT = 30;
    var MIN_CHARS = 20;
    var REVIEW_ROUTE = "/dsh-style-detector/review";
    var SEMANTIC_W = 0.18;
    var MODE_KEY = "dsh.style-detector.mode.v1";
    var DEFAULT_MODE = "general";
    var IGNORE_KEY = "dsh.style-detector.ignore.v1";
    var CUSTOM_KEY = "dsh.style-detector.custom.v1";
    var TARGET_KEY = "dsh.style-detector.target.v1";
    var V2_KEY = "dsh.style-detector.v2.v1";
    var DEFAULT_TARGET = 30;
    var TARGET_PRESETS = [25, 30, 36];
    var FONT_KEY = "dsh.style-detector.font.v1";
  // 复审用的模型（面板里自己挑的）；留空表示跟随设置里的默认模型
  var MODEL_KEY = "dsh.style-detector.model.v1";
    // 标注页正文字号四档，默认第二档
    var FONT_PX = [11.5, 13, 15, 17.5];
    var FONT_DEFAULT = 1;
    var TOP_LIMIT = 10;
    var TOP_CANDIDATES = 20;
    var EMPTY_IGNORE = { items: {}, dims: {} };
    var EMPTY_CUSTOM = { deny: [], allow: [] };
    // 错字校对是另一件事（文本对错，不是文风），所以单独一条路由
    var PROOF_ROUTE = "/dsh-style-detector/proofread";
    // 配置备份格式的版本号。以后改结构就加一，导入时好认。
    var CONFIG_VERSION = 1;
    /* ------------------------------------------------------------------ *
     * Dictionaries
     * ------------------------------------------------------------------ */

    // 纯套话词组（不含纯虚词，虚词归连接词维度）
    var CLICHES = [
      "在当今社会", "在当今时代", "随着科技的飞速发展", "随着社会的发展", "随着时代的发展",
      "众所周知", "不难发现", "不难看出", "综上所述", "总而言之", "总的来说",
      "需要注意的是", "值得注意的是", "值得一提的是", "由此可见", "正因如此",
      "让人不禁", "不禁让人", "毫无疑问", "某种程度上", "在一定程度上", "某种意义上",
      "可以说", "事实上", "实际上",
      "赋能", "抓手", "闭环", "底层逻辑",
      "多维度", "全方位", "深层次", "系统性地", "极大地", "进一步", "有效地",
      "显著提升", "蓬勃发展", "日益", "愈发", "不可或缺", "至关重要", "举足轻重",
      "大有裨益", "意义深远", "影响深远", "扮演着重要的角色", "起到了重要的作用",
      "发挥了重要作用", "丰富多样", "方方面面", "各个领域", "诸多", "一系列"
    ];

    // 网文小说模式的套话表。AI 写小说几乎不写「赋能/闭环」，它写的是另一种套句——
    // 表情包式动作（眼中闪过一丝）、副词堆砌（缓缓地/轻轻地）、万能情绪词（五味杂陈）。
    var FICTION_CLICHES = [
      "眼中闪过一丝", "眼中闪过一抹", "闪过一丝不易察觉", "眼底闪过", "眸光一闪", "眼中精光",
      "嘴角勾起", "嘴角微微上扬", "嘴角扬起一抹", "勾起一抹", "露出一抹", "露出一丝",
      "深吸一口气", "倒吸一口凉气", "呼吸一滞", "瞳孔骤缩", "瞳孔微缩", "心头一紧", "心中一紧",
      "不由得一愣", "微微一愣", "愣在原地", "怔在原地", "呆在原地",
      "空气仿佛凝固", "时间仿佛静止", "时间仿佛在这一刻", "仿佛整个世界", "仿佛在诉说着",
      "心中暗道", "心中暗想", "心中一惊", "五味杂陈", "难以言喻", "无法形容", "不知过了多久",
      "这一切的一切", "命运的齿轮", "若有所思", "欲言又止", "不置可否", "似笑非笑", "意味深长地",
      "饶有兴致地", "不易察觉地", "缓缓地", "轻轻地", "淡淡地", "默默地", "静静地", "无声地",
      "话音落下", "话音刚落", "此言一出", "话虽如此", "不得不说"
    ];

    // 这几个词自己也出现在正常中文里（「这个方案要真正落地」「先在门店落地一套流程」），
    // 一律按套话删掉会误伤。只有它们按黑话用法出现时才算：
    //   ① 后面跟「化」或「能力」（落地化、沉淀能力）
    //   ② 后面跟「的 / 层面 / 维度」（落地的颗粒度、颗粒度层面）
    //   ③ 前面（可隔一个「的」和方位词）是抽象名词：业务落地、经验沉淀、业务场景中的落地
    // 只命中这些情况，剩下的都当正常中文放过——宁可漏报，也不误删。
    var CONTEXT_CLICHES = ["落地", "沉淀", "颗粒度", "拉通"];

    var CONTEXT_NOUN_HEADS = [
      "业务", "战略", "组织", "能力", "价值", "体系", "生态", "平台", "数据", "资源",
      "经验", "方法论", "文化", "目标", "成果", "管理", "运营", "流程", "场景", "市场",
      "用户", "客户", "产品", "技术", "品牌", "内容", "商业", "行业", "系统", "机制",
      "标准", "规范", "认知", "打法", "策略", "模式", "链路", "项目", "部门", "团队",
      "指标", "成本", "效率", "需求", "方案", "规划", "动作", "闭环",
      // 这四个词自己前面出现时，后面的那个也一定是黑话语境（「落地的颗粒度」）
      "落地", "沉淀", "拉通", "颗粒度"
    ];

    function isBuzzUse(text, start, end) {
      var tail1 = text.charAt(end);
      var tail2 = text.slice(end, end + 2);
      if (tail1 === "化") return true;
      if (tail2 === "能力") return true;
      if (tail1 === "的" || tail2 === "层面" || tail2 === "维度") return true;
      var h = start;
      if (h > 0 && text.charAt(h - 1) === "的") {
        h -= 1;
        if (h > 0 && "中里上内下间".indexOf(text.charAt(h - 1)) >= 0) h -= 1;
      }
      if (endsWithNounHead(text, h)) return true;
      return false;
    }

    function endsWithNounHead(text, pos) {
      var head = text.slice(pos > 2 ? pos - 2 : 0, pos);
      for (var i = 0; i < CONTEXT_NOUN_HEADS.length; i++) {
        if (head === CONTEXT_NOUN_HEADS[i]) return true;
      }
      return false;
    }

    // 与 findMatches 同构，但命中后还要过一遍 isBuzzUse；不算黑话用法的直接跳过，
    // 同时也不占位（不挡别的词）。
    function findContextMatches(text, occupied) {
      var hits = [];
      var taken = occupied || [];
      for (var w = 0; w < CONTEXT_CLICHES.length; w++) {
        var word = CONTEXT_CLICHES[w];
        var from = 0;
        while (from <= text.length - word.length) {
          var at = text.indexOf(word, from);
          if (at < 0) break;
          var end = at + word.length;
          var clash = false;
          for (var t = 0; t < taken.length; t++) {
            if (at < taken[t][1] && taken[t][0] < end) { clash = true; break; }
          }
          if (!clash && isBuzzUse(text, at, end)) {
            var hit = { start: at, end: end, phrase: word, cond: true };
            hits.push(hit);
            taken.push([hit.start, hit.end]);
          }
          from = end;
        }
      }
      return hits;
    }
    // 连接词（含破折号单独处理）
    // 枚举套话：单独出现不算，成套出现才是「首先…其次…最后」那套模板
    var ENUM_WORDS = { "首先": 1, "其次": 1, "再次": 1, "然后": 1, "最后": 1 };

    var CONNECTIVES = [
      "首先", "其次", "再次", "然后", "最后", "此外", "另外", "与此同时", "同时",
      "因此", "所以", "然而", "但是", "不过", "并且", "而且", "从而", "进而",
      "不仅", "至于", "例如", "比如", "总之", "也就是说", "换句话说", "当然",
      "一方面", "另一方面", "不仅如此"
    ];

    // 小说里「然后/于是/同时/当然/例如」是口语节奏，不是 AI 味；只留书面逻辑连接词。
    var CONNECTIVES_FICTION = [
      "首先", "其次", "再次", "最后", "此外", "另外", "然而", "因此", "所以",
      "但是", "不过", "并且", "而且", "从而", "进而", "不仅", "总之",
      "也就是说", "换句话说", "一方面", "另一方面", "不仅如此"
    ];

    var CONN_SWAP = {
      "然而": { to: "但", dropComma: true },
      "但是": { to: "但", dropComma: true },
      "因此": { to: "所以", dropComma: false },
      "所以": { to: "于是", dropComma: false },
      "不过": { to: "只是", dropComma: false },
      "不仅": { to: "不只", dropComma: false }
    };

    var DIM_LABEL = {
      cliche: "套话", uniformity: "句式", parallel: "排比",
      connective: "连接词", detail: "细节", diversity: "重复", semantic: "语义"
    };

    // 文体模式：同一套算法，换词表、换权重、换「具体」的定义。
    // 加新模式只要在这里加一条，UI、打分、复审提示词都会跟着走。
    var MODES = {
      general: {
        label: "通用",
        short: "说明 · 议论 · 公文",
        w: { cliche: 0.24, uniformity: 0.20, parallel: 0.14, connective: 0.14, detail: 0.16, diversity: 0.12 },
        labels: {
          cliche: "AI 套话", uniformity: "句式均匀", parallel: "排比结构",
          connective: "连接词密度", detail: "缺具体信息", diversity: "词汇重复"
        }
      },
      fiction: {
        label: "网文",
        short: "正文 · 对白 · 场景",
        // 小说里套话与连接词本来少，权重压低；句子节奏和画面感才是 AI 小说最容易露馅的地方。
        w: { cliche: 0.20, uniformity: 0.22, parallel: 0.10, connective: 0.10, detail: 0.20, diversity: 0.18 },
        labels: {
          cliche: "AI 腔套句", uniformity: "句子节奏平", parallel: "排比结构",
          connective: "连接词密度", detail: "缺画面感", diversity: "描写重复"
        }
      }
    };

    var SENT_END = "。！？!?…";

    /* ------------------------------------------------------------------ *
     * Small utilities
     * ------------------------------------------------------------------ */

    function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

    function charCount(text) {
      return String(text || "").replace(/\s/g, "").length;
    }

    function plainLen(text) {
      return String(text || "").replace(/[\s，。！？、；：“”‘’「」『』（）()《》—…·,.;:!?"']/g, "").length;
    }

    function toneOf(score) {
      if (score >= 66) return "high";
      if (score >= 36) return "mid";
      return "low";
    }

    function stats(arr) {
      var n = arr.length;
      if (!n) return { mean: 0, sd: 0, cv: 0 };
      var sum = 0, i;
      for (i = 0; i < n; i++) sum += arr[i];
      var mean = sum / n, v = 0;
      for (i = 0; i < n; i++) v += (arr[i] - mean) * (arr[i] - mean);
      var sd = Math.sqrt(v / n);
      return { mean: mean, sd: sd, cv: mean > 0 ? sd / mean : 0 };
    }

    function applyEdits(text, edits) {
      var list = edits.slice().sort(function (a, b) { return b.start - a.start; });
      var out = text;
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        out = out.slice(0, e.start) + e.text + out.slice(e.end);
      }
      return out;
    }

    function splitSentences(text) {
      var out = [];
      var n = text.length;
      var start = 0;
      function push(s, e) {
        if (text.slice(s, e).replace(/\s/g, "").length) {
          out.push({ start: s, end: e, text: text.slice(s, e) });
        }
      }
      var i = 0;
      while (i < n) {
        var ch = text.charAt(i);
        if (SENT_END.indexOf(ch) >= 0) {
          var j = i + 1;
          while (j < n && (SENT_END.indexOf(text.charAt(j)) >= 0 || "”’」』）)\"'".indexOf(text.charAt(j)) >= 0)) j++;
          push(start, j);
          start = j;
          i = j;
        } else if (ch === "\n") {
          push(start, i);
          start = i + 1;
          i = start;
        } else {
          i++;
        }
      }
      if (start < n) push(start, n);
      return out;
    }

    function splitParagraphs(text) {
      var out = [], last = 0, i = 0, n = text.length;
      while (i < n) {
        if (text.charAt(i) === "\n") {
          if (i > last) out.push({ start: last, end: i });
          while (i < n && (text.charAt(i) === "\n" || text.charAt(i) === "\r")) i++;
          last = i;
        } else {
          i++;
        }
      }
      if (last < n) out.push({ start: last, end: n });
      return out.filter(function (p) {
        return text.slice(p.start, p.end).replace(/\s/g, "").length > 0;
      });
    }

    function findMatches(text, words, occupied) {
      var list = words.slice().sort(function (a, b) { return b.length - a.length; });
      var hits = [];
      var taken = occupied || [];
      for (var w = 0; w < list.length; w++) {
        var word = list[w];
        var from = 0;
        while (from <= text.length - word.length) {
          var at = text.indexOf(word, from);
          if (at < 0) break;
          var clash = false;
          for (var t = 0; t < taken.length; t++) {
            if (at < taken[t][1] && taken[t][0] < at + word.length) { clash = true; break; }
          }
          if (!clash) {
            var hit = { start: at, end: at + word.length, phrase: word };
            hits.push(hit);
            taken.push([hit.start, hit.end]);
          }
          from = at + word.length;
        }
      }
      hits.sort(function (a, b) { return a.start - b.start; });
      return hits;
    }

    function paraIndexAt(paragraphs, pos) {
      for (var i = 0; i < paragraphs.length; i++) {
        if (pos >= paragraphs[i].start && pos < paragraphs[i].end) return i;
      }
      return -1;
    }

    function pickSplit(sentText) {
      var cands = [], i;
      for (i = 0; i < sentText.length; i++) {
        var c = sentText.charAt(i);
        if (c === "，" || c === "；") cands.push(i);
      }
      if (!cands.length) return null;
      var target = Math.round(sentText.length * 0.45);
      var best = cands[0], bestD = 1e9;
      for (i = 0; i < cands.length; i++) {
        var d = Math.abs(cands[i] - target);
        if (d < bestD) { bestD = d; best = cands[i]; }
      }
      var head = sentText.slice(0, best);
      var tail = sentText.slice(best + 1);
      if (plainLen(head) < 8 || plainLen(tail) < 8) return null;
      return { text: head + "。" + tail, at: head.slice(-8) };
    }

    function snippetOf(text) {
      var t = String(text || "").replace(/\s+/g, " ").trim();
      return t.length > 34 ? t.slice(0, 34) + "…" : t;
    }

    // 删除套话时的边界扩展。中文套话常带「地/的」或紧跟逗号，按词硬删会留下
    // 「，，」或「它地。」这类残句，所以删除区间要把这些碎片一起带走。
    var DELETE_PREFIX = ["我们也", "我们", "也", "还", "同时", "而且", "并且", "另外", "此外", "总之", "总的来说"];
    var CJK_PARTICLE = "的地得";
    var CJK_PUNCT = "，,、；;：:";

    function expandDelete(text, start, end) {
      var i;
      for (i = 0; i < DELETE_PREFIX.length; i++) {
        var p = DELETE_PREFIX[i];
        if (start >= p.length && text.slice(start - p.length, start) === p) {
          var before = start - p.length;
          if (before === 0) { start = before; break; }
          var prev = text.charAt(before - 1);
          if (CJK_PUNCT.indexOf(prev) >= 0 || SENT_END.indexOf(prev) >= 0 || prev === "\n") {
            start = before;
            break;
          }
        }
      }
      while (start > 0 && CJK_PARTICLE.indexOf(text.charAt(start - 1)) >= 0) start--;
      while (start > 0 && CJK_PUNCT.indexOf(text.charAt(start - 1)) >= 0) start--;
      while (end < text.length && CJK_PARTICLE.indexOf(text.charAt(end)) >= 0) end++;
      while (end < text.length && CJK_PUNCT.indexOf(text.charAt(end)) >= 0) end++;
      return { start: start, end: end };
    }

    // 只吃尾部标点：句中连接词删掉后要留着前面那个逗号，否则两句会粘在一起。
    function trimTrailingPunct(text, start, end) {
      var e = end;
      while (e < text.length && CJK_PUNCT.indexOf(text.charAt(e)) >= 0) e++;
      return { start: start, end: e };
    }

    function sentIndexAt(sentences, pos) {
      for (var i = 0; i < sentences.length; i++) {
        if (pos >= sentences[i].start && pos < sentences[i].end) return i;
      }
      return -1;
    }

    /* ------------------------------------------------------------------ *
     * Rule engine — one function per dimension
     * ------------------------------------------------------------------ */

    // 自定义词表：黑名单永远算套话，白名单永远不算（优先级更高）
    function customDeny(custom) {
      var out = [], i;
      var src = (custom && custom.deny) || [];
      for (i = 0; i < src.length; i++) {
        var w = typeof src[i] === "string" ? src[i].trim() : "";
        if (w) out.push(w);
      }
      return out;
    }

    function allowSet(custom) {
      var out = {}, i;
      var src = (custom && custom.allow) || [];
      for (i = 0; i < src.length; i++) {
        var w = typeof src[i] === "string" ? src[i].trim() : "";
        if (w) out[w] = true;
      }
      return out;
    }

    function keepHits(hits, allow) {
      var out = [], i;
      for (i = 0; i < hits.length; i++) {
        if (allow[hits[i].phrase]) continue;
        out.push(hits[i]);
      }
      return out;
    }

    /* ------------------------------------------------------------------ *
     * 错字：固定错配表
     * 只收「写错了」的词，同一张表里不出现可以两用的写法。
     * 表里的词一旦命中就报「确定」，误报率接近零，所以不走模型也立刻看得见。
     * ------------------------------------------------------------------ */

    var TYPO_MAP = [
      ["按耐不住", "按捺不住"], ["甘败下风", "甘拜下风"], ["不径而走", "不胫而走"],
      ["走头无路", "走投无路"], ["迫不急待", "迫不及待"], ["一如继往", "一如既往"],
      ["穿流不息", "川流不息"], ["美仑美奂", "美轮美奂"], ["再接再励", "再接再厉"],
      ["变本加利", "变本加厉"], ["阴谋鬼计", "阴谋诡计"], ["明枪暗剑", "明枪暗箭"],
      ["一诺千斤", "一诺千金"], ["世外桃园", "世外桃源"], ["万古常青", "万古长青"],
      ["自抱自弃", "自暴自弃"], ["曾经苍海", "曾经沧海"], ["发人深醒", "发人深省"],
      ["名符其实", "名副其实"], ["迫在眉捷", "迫在眉睫"], ["迫在眉节", "迫在眉睫"],
      ["记忆尤新", "记忆犹新"], ["步步为赢", "步步为营"], ["一愁莫展", "一筹莫展"],
      ["委屈求全", "委曲求全"], ["无所是从", "无所适从"], ["仗义直言", "仗义执言"],
      ["不记其数", "不计其数"], ["苍海桑田", "沧海桑田"], ["利令志昏", "利令智昏"],
      ["冒然行事", "贸然行事"], ["融汇贯通", "融会贯通"], ["深明大意", "深明大义"],
      ["肆无忌殚", "肆无忌惮"], ["万事具备", "万事俱备"], ["悬梁刺骨", "悬梁刺股"],
      ["言简意骇", "言简意赅"], ["一劳永易", "一劳永逸"], ["以逸代劳", "以逸待劳"],
      ["应接不瑕", "应接不暇"], ["永往直前", "勇往直前"], ["由然而生", "油然而生"],
      ["怨天由人", "怨天尤人"], ["崭露头脚", "崭露头角"], ["振聋发馈", "振聋发聩"],
      ["自出新裁", "自出心裁"], ["莫明其妙", "莫名其妙"], ["莫名奇妙", "莫名其妙"],
      ["相辅相承", "相辅相成"], ["前扑后继", "前仆后继"], ["披星带月", "披星戴月"],
      ["破斧沉舟", "破釜沉舟"], ["眼花瞭乱", "眼花缭乱"], ["好高鹜远", "好高骛远"],
      ["如雷灌耳", "如雷贯耳"], ["消声匿迹", "销声匿迹"], ["真知卓见", "真知灼见"],
      ["卓有成郊", "卓有成效"], ["全神灌注", "全神贯注"], ["重蹈复辙", "重蹈覆辙"],
      ["一视同人", "一视同仁"], ["兴高彩烈", "兴高采烈"], ["无精打彩", "无精打采"],
      ["神彩奕奕", "神采奕奕"], ["张灯结采", "张灯结彩"], ["丰功伟迹", "丰功伟绩"],
      ["要言不繁", "要言不烦"], ["以德报愿", "以德报怨"], ["病入膏盲", "病入膏肓"],
      ["病入膏荒", "病入膏肓"], ["鞭长莫急", "鞭长莫及"], ["金榜提名", "金榜题名"],
      ["如愿已偿", "如愿以偿"], ["卓而不群", "卓尔不群"], ["提心掉胆", "提心吊胆"],
      ["毛骨耸然", "毛骨悚然"], ["汗流夹背", "汗流浃背"], ["不甘势弱", "不甘示弱"],
      ["如法泡制", "如法炮制"], ["循规蹈距", "循规蹈矩"], ["按步就班", "按部就班"],
      ["自园其说", "自圆其说"], ["草管人命", "草菅人命"], ["穿带一新", "穿戴一新"],
      ["关怀倍至", "关怀备至"], ["倍受欢迎", "备受欢迎"], ["感同深受", "感同身受"],
      ["另人兴奋", "令人兴奋"], ["目炫神迷", "目眩神迷"], ["不径相同", "不尽相同"],
      ["言不由中", "言不由衷"], ["无计于事", "无济于事"], ["老奸巨滑", "老奸巨猾"],
      ["急不可奈", "急不可耐"], ["心浮气燥", "心浮气躁"], ["烦燥不安", "烦躁不安"],
      ["萎糜不振", "萎靡不振"], ["风糜一时", "风靡一时"], ["望而怯步", "望而却步"],
      ["针贬时弊", "针砭时弊"], ["名列前矛", "名列前茅"], ["名不符实", "名不副实"],
      ["首曲一指", "首屈一指"], ["弱不经风", "弱不禁风"], ["情不自尽", "情不自禁"],
      ["惹事生非", "惹是生非"], ["各行其事", "各行其是"], ["既往不究", "既往不咎"],
      ["不落巢臼", "不落窠臼"], ["食不裹腹", "食不果腹"], ["天网灰灰", "天网恢恢"],
      ["满腹经论", "满腹经纶"], ["翻天复地", "翻天覆地"], ["天翻地复", "天翻地覆"],
      ["默守成规", "墨守成规"], ["义气用事", "意气用事"], ["谈笑风声", "谈笑风生"],
      ["不落窼臼", "不落窠臼"], ["竞竞业业", "兢兢业业"], ["层出不究", "层出不穷"],
      ["相形见拙", "相形见绌"], ["出奇不意", "出其不意"], ["再所不辞", "在所不辞"],
      ["运筹帷握", "运筹帷幄"], ["恰到好去", "恰到好处"], ["刻骨名心", "刻骨铭心"],
      ["一败途地", "一败涂地"], ["不知所错", "不知所措"], ["迫不得己", "迫不得已"],
      ["推心至腹", "推心置腹"], ["百无聊奈", "百无聊赖"], ["心恢意冷", "心灰意冷"],
      ["言不由哀", "言不由衷"], ["如火如茶", "如火如荼"], ["一塌胡涂", "一塌糊涂"],
      ["慢不经心", "漫不经心"], ["轻而一举", "轻而易举"], ["举一返三", "举一反三"],
      ["不记前嫌", "不计前嫌"], ["自顾不瑕", "自顾不暇"], ["无以伦比", "无与伦比"],
      ["措手不急", "措手不及"], ["翻来复去", "翻来覆去"], ["鬼鬼崇崇", "鬼鬼祟祟"],
      ["直接了当", "直截了当"], ["按奈不住", "按捺不住"], ["气极败坏", "气急败坏"],
      ["锦秀前程", "锦绣前程"], ["各抒已见", "各抒己见"], ["中西合壁", "中西合璧"],
      ["珠联壁合", "珠联璧合"], ["白壁微瑕", "白璧微瑕"], ["完壁归赵", "完璧归赵"],
      ["应运而升", "应运而生"], ["三翻五次", "三番五次"], ["层峦叠障", "层峦叠嶂"],
      ["纵横搏阖", "纵横捭阖"], ["脍灸人口", "脍炙人口"], ["如雷惯耳", "如雷贯耳"],
      ["按部就搬", "按部就班"], ["精兵减政", "精兵简政"], ["戒骄戒燥", "戒骄戒躁"],
      ["急功进利", "急功近利"], ["惨绝人圜", "惨绝人寰"], ["莫不关心", "漠不关心"],
      ["不可明状", "不可名状"], ["置若惘闻", "置若罔闻"], ["慢无边际", "漫无边际"],
      ["漫无目地", "漫无目的"], ["不修篇幅", "不修边幅"], ["兼收并畜", "兼收并蓄"],
      ["无动于中", "无动于衷"], ["水乳交溶", "水乳交融"], ["拨苗助长", "拔苗助长"],
      ["不径之谈", "不经之谈"], ["荒诞不径", "荒诞不经"], ["信笔涂鸭", "信笔涂鸦"],
      ["有条不絮", "有条不紊"], ["声名雀起", "声名鹊起"], ["趋之若骛", "趋之若鹜"],
      ["高瞻远嘱", "高瞻远瞩"], ["众口烁金", "众口铄金"], ["捉襟见纣", "捉襟见肘"],
      ["含辛如苦", "含辛茹苦"], ["心急如梵", "心急如焚"], ["心悦臣服", "心悦诚服"],
      ["引以为诫", "引以为戒"], ["杀一敬百", "杀一儆百"], ["一愁不展", "一筹莫展"],
      ["有持无恐", "有恃无恐"], ["既使", "即使"], ["烦燥", "烦躁"],
      ["干躁", "干燥"], ["急燥", "急躁"], ["暴燥", "暴躁"],
      ["浮燥", "浮躁"], ["燥动", "躁动"], ["渲泄", "宣泄"],
      ["签定", "签订"], ["做为", "作为"], ["即然", "既然"],
      ["按装", "安装"], ["布署", "部署"], ["部置", "布置"],
      ["凑效", "奏效"], ["抵毁", "诋毁"],
      ["污告", "诬告"], ["辨护", "辩护"], ["辨论", "辩论"],
      ["辩别", "辨别"], ["缜蜜", "缜密"], ["详和", "祥和"],
      ["安祥", "安详"], ["祥细", "详细"], ["端祥", "端详"],
      ["吉详", "吉祥"], ["拜竭", "拜谒"], ["恶耗", "噩耗"],
      ["颚然", "愕然"], ["松驰", "松弛"], ["寒喧", "寒暄"],
      ["暄嚣", "喧嚣"], ["佝娄", "佝偻"], ["踉呛", "踉跄"],
      ["接恰", "接洽"], ["恰谈", "洽谈"], ["签暑", "签署"],
      ["暑名", "署名"], ["杀戳", "杀戮"], ["蜇伏", "蛰伏"]
    ];

    // 同一张表里可能有重复（人工维护时容易写重），跑之前先去重，免得同一处报两遍
    var TYPO_LIST = (function () {
      var seen = {}, out = [], i;
      for (i = 0; i < TYPO_MAP.length; i++) {
        var w = TYPO_MAP[i][0], r = TYPO_MAP[i][1];
        if (!w || !r || w === r) continue;
        if (seen[w]) continue;
        seen[w] = true;
        out.push([w, r]);
      }
      // 长的先匹配：「不径而走」不能被「不径」之类的短词抢先
      out.sort(function (a, b) { return b[0].length - a[0].length; });
      return out;
    })();

    function countOccur(text, word) {
      if (!word) return 0;
      var n = 0, from = 0;
      while (true) {
        var at = text.indexOf(word, from);
        if (at < 0) break;
        n++;
        from = at + word.length;
      }
      return n;
    }

    // 书名号里的一律不报；引号里且反复出现（≥2 次）的当作专有名词，也不报。
    // 宁可漏报，也不要把人家的人名、门牌号改成成语。
    function insideBookTitle(text, start) {
      var open = text.lastIndexOf("《", start);
      var close = text.lastIndexOf("》", start);
      return open > close;
    }

    function insideQuote(text, start) {
      var pairs = [["「", "」"], ["“", "”"], ["『", "』"]];
      for (var i = 0; i < pairs.length; i++) {
        var open = text.lastIndexOf(pairs[i][0], start);
        var close = text.lastIndexOf(pairs[i][1], start);
        if (open > close) return true;
      }
      return false;
    }

    function looksProperNoun(text, start, word) {
      if (insideBookTitle(text, start)) return true;
      if (insideQuote(text, start) && countOccur(text, word) >= 2) return true;
      return false;
    }

    // 本地固定表：立刻出结果，不花一分钱
    function localTypos(text, allow) {
      var out = [], seen = {}, i;
      for (i = 0; i < TYPO_LIST.length; i++) {
        var wrong = TYPO_LIST[i][0], right = TYPO_LIST[i][1];
        if (allow && allow[wrong]) continue;
        var from = 0;
        while (true) {
          var at = text.indexOf(wrong, from);
          if (at < 0) break;
          from = at + wrong.length;
          if (seen[at]) continue;
          if (looksProperNoun(text, at, wrong)) continue;
          seen[at] = true;
          out.push({
            start: at,
            end: at + wrong.length,
            wrong: wrong,
            right: right,
            reason: "应作「" + right + "」",
            confidence: 3,
            source: "local"
          });
        }
      }
      return out;
    }

    // 模型报的条目：过一遍白名单与专有名词，再按位置去重
    function mergeProof(text, local, remote, allow) {
      var out = [], seen = {}, i;
      for (i = 0; i < local.length; i++) {
        seen[local[i].start] = true;
        out.push(local[i]);
      }
      var list = Array.isArray(remote) ? remote : [];
      for (i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it || typeof it.start !== "number" || typeof it.end !== "number") continue;
        if (it.end <= it.start || it.start < 0 || it.end > text.length) continue;
        if (seen[it.start]) continue;
        var wrong = typeof it.wrong === "string" && it.wrong ? it.wrong : text.slice(it.start, it.end);
        var right = typeof it.right === "string" ? it.right : "";
        if (!wrong || !right || wrong === right) continue;
        if (allow && (allow[wrong] || allow[right])) continue;
        if (looksProperNoun(text, it.start, wrong)) continue;
        seen[it.start] = true;
        out.push({
          start: it.start,
          end: it.end,
          wrong: wrong,
          right: right,
          reason: typeof it.reason === "string" ? it.reason : "",
          confidence: typeof it.confidence === "number" ? it.confidence : 2,
          source: "model"
        });
      }
      out.sort(function (a, b) { return a.start - b.start; });
      return out;
    }

    function dimCliche(text, chars, sentences, mode, custom) {
      var fic = mode === "fiction";
      var allow = allowSet(custom);
      var words = (fic ? FICTION_CLICHES : CLICHES).concat(customDeny(custom));
      var hits = keepHits(findMatches(text, words), allow);
      // 双用途词（落地/沉淀）只在职场黑话里才算；小说里「落地」就是落到地上。
      if (!fic) {
        var condRanges = [];
        for (var ch = 0; ch < hits.length; ch++) condRanges.push([hits[ch].start, hits[ch].end]);
        hits = hits.concat(keepHits(findContextMatches(text, condRanges), allow));
      }
      hits.sort(function (a, b) { return a.start - b.start; });
      var dens = chars > 0 ? (hits.length / chars) * 100 : 0;
      // 小说词表短但每处更典型，密度系数略高
      var score = clamp(dens * (fic ? 30 : 25), 0, 100);
      if (hits.length && score < 8) score = 8;

      // 逐句预演：一句里的套话全删掉后若只剩残句（如「它地。」），
      // 这句就不自动改写，只给建议，免得改完比原文更别扭。
      var ranges = [], bySent = {}, h, s;
      for (h = 0; h < hits.length; h++) {
        var rng = expandDelete(text, hits[h].start, hits[h].end);
        ranges.push(rng);
        var si = sentIndexAt(sentences, hits[h].start);
        if (!bySent[si]) bySent[si] = [];
        bySent[si].push({ hit: hits[h], range: rng });
      }
      var noEdit = {};
      for (var key in bySent) {
        if (!Object.prototype.hasOwnProperty.call(bySent, key)) continue;
        var sent = sentences[Number(key)];
        if (!sent) continue;
        var group = bySent[key];
        var left = plainLen(text.slice(sent.start, sent.end));
        for (var g = 0; g < group.length; g++) {
          left -= plainLen(text.slice(group[g].range.start, group[g].range.end));
        }
        if (left < 4) {
          for (var g2 = 0; g2 < group.length; g2++) noEdit[group[g2].hit.start] = true;
        }
      }

      var issues = [], extra = [];
      for (s = 0; s < hits.length; s++) {
        var hit = hits[s];
        var edit = noEdit[hit.start]
          ? []
          : [{ start: ranges[s].start, end: ranges[s].end, text: "", pri: 5 }];
        var item = {
          id: "cliche-" + s,
          dim: "cliche",
          start: hit.start,
          end: hit.end,
          snippet: hit.phrase,
          title: (fic ? "套句「" : "套话「") + hit.phrase + "」",
          advice: fic
            ? "「" + hit.phrase + "」这类句子读者已经见过几千遍，换成一个具体的动作或一个能看见的细节。"
            : hit.cond
              ? "「" + hit.phrase + "」这里是黑话用法，不是真的「落到实地」，换成一个具体动作。"
              : "删掉「" + hit.phrase + "」，直接从后面的事实说起，句子会更硬。",
          // 这一条占本分项多少分：忽略它时就从本分项里减掉这一份
          pen: hits.length ? score / hits.length : 0,
          edits: edit
        };
        if (issues.length < 10) {
          issues.push(item);
        } else {
          for (var e = 0; e < edit.length; e++) extra.push(edit[e]);
        }
      }

      var tip = hits.length
        ? (fic
            ? "全文 " + hits.length + " 处套句，换掉后情节不会少一个字。"
            : "全文 " + hits.length + " 处套话，删掉后信息量不变。")
        : (fic ? "没有典型的 AI 腔套句，这一项没问题。" : "套话很少，这一项没问题。");
      if (hits.length > 10) tip += "另有 " + (hits.length - 10) + " 处未逐条列出。";
      return { score: score, issues: issues, tip: tip, hits: hits.length, extraEdits: extra };
    }

    function dimUniform(text, sentences, paragraphs) {
      var lens = [];
      for (var i = 0; i < sentences.length; i++) {
        var l = plainLen(sentences[i].text);
        if (l > 0) lens.push(l);
      }
      var issues = [];
      var paraLens = [];
      for (var p = 0; p < paragraphs.length; p++) {
        paraLens.push(plainLen(text.slice(paragraphs[p].start, paragraphs[p].end)));
      }
      var sSt = stats(lens);
      var pSt = stats(paraLens);

      var sComp = 40;
      var uniformRatio = 0;
      if (lens.length >= 3) {
        sComp = clamp(((0.62 - sSt.cv) / 0.44) * 100, 0, 100);
        var near = 0;
        for (var k = 0; k < lens.length; k++) {
          if (Math.abs(lens[k] - sSt.mean) <= sSt.mean * 0.25) near++;
        }
        uniformRatio = near / lens.length;
      }
      var pComp = paraLens.length >= 3
        ? clamp(((0.55 - pSt.cv) / 0.40) * 100, 0, 100)
        : 40;

      // 场景例外：短句连排是正常节奏，不是「句式均匀」。动作推进、对白交锋时，
      // 一连七八个四到八字的短句，句长变异系数天然就小——这不是 AI 味，是人写得紧。
      // 只有平均句长明显偏短时才走这条豁免，长句为主的稿子照旧按原规则算。
      var shortScene = sSt.mean > 0 && sSt.mean <= 13 && lens.length >= 4;
      if (shortScene) sComp = clamp(sComp * 0.5, 0, 100);

      var score = clamp(0.55 * sComp + 0.25 * pComp + 0.20 * uniformRatio * 100, 0, 100);

      // 长句拆解建议：最长的两句，且明显超过平均
      var sorted = sentences.slice().sort(function (a, b) {
        return plainLen(b.text) - plainLen(a.text);
      });
      for (var s = 0; s < sorted.length && issues.length < 2; s++) {
        var sent = sorted[s];
        var sl = plainLen(sent.text);
        if (sl < 42) continue;
        // 只跟「平均值的 1.5 倍」比会漏掉通篇长句的稿子：那时 mean 本身就被抬高了，
        // 四十多字的句子永远够不上 1.5 倍。整篇平均已经很长时，改按绝对长度判断。
        if (sSt.mean < 30 && sl < sSt.mean * 1.5) continue;
        var split = pickSplit(sent.text);
        issues.push({
          id: "long-" + issues.length,
          dim: "uniformity",
          start: sent.start,
          end: sent.end,
          snippet: snippetOf(sent.text),
          title: "长句 " + sl + " 字",
          advice: split
            ? "在「" + split.at + "」后断成两句，让节奏有起伏。"
            : "这句太长且没有可断的逗号，考虑删掉修饰语或改成短句并列。",
          edits: split
            ? [{ start: sent.start, end: sent.end, text: split.text, pri: 2 }]
            : []
        });
      }

      // 通篇长句：一句都不算「特别长」，但每句都长，读起来一口气接不上。
      // 上面那条「最长句」规则抓不到这种（没有离群值），单独报一条。
      var longCount = 0;
      for (var lc = 0; lc < lens.length; lc++) if (lens[lc] >= 32) longCount++;
      if (lens.length >= 4 && sSt.mean >= 32 && longCount / lens.length >= 0.6) {
        var allPick = null;
        for (var ap = 0; ap < sentences.length; ap++) {
          if (plainLen(sentences[ap].text) >= 32) { allPick = sentences[ap]; break; }
        }
        var allSplit = allPick ? pickSplit(allPick.text) : null;
        issues.push({
          id: "long-all",
          dim: "uniformity",
          start: allPick ? allPick.start : null,
          end: allPick ? allPick.end : null,
          snippet: allPick ? snippetOf(allPick.text) : "",
          soft: true,
          title: "通篇长句",
          advice: "全篇平均每句 " + Math.round(sSt.mean) + " 字，几乎没有短句。每三句里挑一句压到十个字以内，节奏才有呼吸。",
          edits: allSplit ? [{ start: allPick.start, end: allPick.end, text: allSplit.text, pri: 2 }] : []
        });
      }

      var hint = lens.length >= 3
        ? "句长 " + Math.round(sSt.mean) + " 字，离散度 " + sSt.cv.toFixed(2) +
          (shortScene ? " · 短句场景" : "")
        : "句子太少";
      var tip = shortScene
        ? "这一段的短句是有意的节奏，不算句式均匀。"
        : (lens.length >= 3 && sComp > 55
          ? "句长集中在 " + Math.round(sSt.mean) + " 字附近，让一两句明显更长或更短。"
          : "句长有起伏，这一项没问题。");
      return { score: score, issues: issues, tip: tip, hint: hint };
    }

    function dimParallel(text, sentences, paragraphs) {
      // 排比看的是「连着几句长短几乎一样」，所以按原文顺序切段，而不是按长度分桶：
      // 分桶会把 21 字和 22 字这种只差一个字的句子分到两桶里，真排比反而抓不到。
      // 一段 = 连续若干句，每句与这一段第一句的长度差不超过 3 个字；中间插进一句
      // 明显不同长度的，就断段。
      var runs = [], cur = null;
      var ordHits = [];
      var i;
      for (i = 0; i < sentences.length; i++) {
        var sent = sentences[i];
        var t = sent.text.replace(/^\s+/, "");
        var len = plainLen(t);
        if (len < 4) { cur = null; continue; }
        if (/^(首先|其次|再次|然后|最后|第一|第二|第三|其一|其二|其三|一方面|另一方面|再者)/.test(t)) {
          ordHits.push({ sent: sent, text: t });
          cur = null;
          continue;
        }
        if (len < 12) { cur = null; continue; }
        if (cur && Math.abs(len - cur.base) <= 3) {
          cur.items.push({ sent: sent, text: t });
        } else {
          cur = { base: len, items: [{ sent: sent, text: t }] };
          runs.push(cur);
        }
      }
      if (ordHits.length >= 3) runs.push({ base: 0, items: ordHits, ord: true });

      // 三句工整排比已经很像 AI 了：四句重扣，三句轻扣。两句是正常节奏，不报也不扣。
      var paraCount = 0, heavyCount = 0, issues = [];
      for (i = 0; i < runs.length; i++) {
        var g = runs[i].items;
        if (g.length < 3) continue;
        if (g.length >= 4) heavyCount += g.length - 1;
        paraCount += g.length - 1;
        if (issues.length < 2) {
          var first = g[0].sent;
          issues.push({
            id: "parallel-" + issues.length,
            dim: "parallel",
            start: first.start,
            end: first.end,
            snippet: snippetOf(first.text),
            title: "并列句 " + g.length + " 句",
            advice: g.length >= 4
              ? "连续 " + g.length + " 句长度和结构接近，挑一句改成具体叙述或直接删掉。"
              : "这三句结构太齐了，把其中一句拆成两句短句，或者换个开头。",
            pen: g.length >= 4 ? 18 : 8,
            edits: []
          });
        }
      }

      // 总分总：开头（首段或前 80 字）出现「以下/包括/主要有」等提示语
      var totalPart = false;
      var headEnd = Math.max(80, paragraphs.length ? paragraphs[0].end : 0);
      var head = text.slice(0, Math.min(text.length, headEnd));
      if (/以下|如下|包括|主要有|具体来说|体现在|几个方面|三点|四点/.test(head)) {
        totalPart = true;
      }

      var score = clamp(heavyCount * 18 + (paraCount - heavyCount) * 8 + (totalPart ? 20 : 0), 0, 100);
      var tip = paraCount > 0
        ? "有 " + paraCount + " 组结构相近的句子，打散其中一组即可。"
        : "没有明显的排比痕迹，这一项没问题。";
      if (totalPart) tip += "开头出现了「总分总」的提示语。";
      return { score: score, issues: issues, tip: tip, hint: totalPart ? "含总分总结构" : "" };
    }

    function dimConnective(text, chars, paragraphs, mode, custom) {
      var fic = mode === "fiction";
      var dashHits = [];
      var from = 0;
      while (true) {
        var at = text.indexOf("——", from);
        if (at < 0) break;
        dashHits.push({ start: at, end: at + 2 });
        from = at + 2;
      }
      // 破折号不能「见一个扣一个」：中文里「你听我解释——」这种打断、以及插入语，
      // 用一两个破折号完全正常。真正像 AI 的是成片使用：一段里好几个，
      // 或者全篇四五个以上。所以先统计，再决定要不要扣。
      var dashParas = 0, dashParaAt = -1;
      for (var dp = 0; dp < paragraphs.length; dp++) {
        var dBody = text.slice(paragraphs[dp].start, paragraphs[dp].end);
        var nDash = (dBody.match(/——/g) || []).length;
        if (nDash >= 2) {
          dashParas++;
          if (dashParaAt < 0) dashParaAt = paragraphs[dp].start + dBody.indexOf("——");
        }
      }
      var dashHot = dashHits.length >= 4 || dashParas >= 2;
      var dashCount = dashHot ? Math.min(dashHits.length, 3) : 0;

      var allow = allowSet(custom);
      var hits = keepHits(findMatches(text, fic ? CONNECTIVES_FICTION : CONNECTIVES), allow);

      // 枚举词要成套出现才算 AI 味。「最后还是没说」里的「最后」是时间副词，
      // 单独一个就扣分会把正常叙述误判成公文腔；只有和「首先/其次/再次/然后」
      // 一起出现时，才是「首先…其次…最后」那套模板。
      // 成套出现有两种：不同枚举词凑齐两个以上，或者同一个词反复三次
      // （「然后…然后…然后」）。单独一次「最后」不算。
      var enumSet = {};
      for (var eh = 0; eh < hits.length; eh++) {
        if (ENUM_WORDS[hits[eh].phrase]) {
          enumSet[hits[eh].phrase] = (enumSet[hits[eh].phrase] || 0) + 1;
        }
      }
      var enumKeys = Object.keys(enumSet);
      var enumRepeat = false;
      for (var ek = 0; ek < enumKeys.length; ek++) {
        if (enumSet[enumKeys[ek]] >= 3) enumRepeat = true;
      }
      if (enumKeys.length < 2 && !enumRepeat) {
        hits = hits.filter(function (h) { return !ENUM_WORDS[h.phrase]; });
      }
      // 分号串句：中文 AI 很爱写「A；B；C；D」，一句里塞三四个分句。
      // 不按「见分号就扣」（正常标点也用分号），而是看它是不是成片出现：
      // 一个段落里有 3 个以上分号（也就是 4 个以上分句），且这样的段落占三成以上才扣。
      var semiParas = 0, semiAt = -1;
      for (var sp = 0; sp < paragraphs.length; sp++) {
        var pBody = text.slice(paragraphs[sp].start, paragraphs[sp].end);
        var nSemi = (pBody.match(/[；;]/g) || []).length;
        if (nSemi >= 3) {
          semiParas++;
          if (semiAt < 0) semiAt = paragraphs[sp].start + pBody.search(/[；;]/);
        }
      }
      var semiPart = 0;
      var semiHot = false;
      if (chars >= 60 && semiParas > 0 && semiParas / Math.max(1, paragraphs.length) > 0.3) {
        semiHot = true;
        semiPart = Math.min(30, semiParas * 12);
      }
      // 每个连接词/破折号/分号串各占多少分，忽略时按这个比例减掉
      var hitTotal = hits.length + dashCount + (semiHot ? 1 : 0);
      var dens = chars > 0 ? (hits.length / chars) * 100 : 0;
      var score = clamp(dens * 16 + dashCount * 10 + semiPart, 0, 100);
      if ((hits.length || dashCount || semiHot) && score < 6) score = 6;

      var issues = [];
      var fixedPara = {};
      var fixed = 0;
      for (var i = 0; i < hits.length && fixed < 6; i++) {
        var hit = hits[i];
        var pi = paraIndexAt(paragraphs, hit.start);
        if (!fixedPara[pi]) { fixedPara[pi] = true; continue; } // 每段第一个连接词保留
        fixed++;
        var swap = CONN_SWAP[hit.phrase];
        var edits;
        var advice;
        if (swap) {
          var send = hit.end;
          if (swap.dropComma && (text.charAt(send) === "，" || text.charAt(send) === ",")) send++;
          edits = [{ start: hit.start, end: send, text: swap.to, pri: 4 }];
          advice = "「" + hit.phrase + "」换成「" + swap.to + "」，读起来更像人说话。";
        } else {
          var cut = trimTrailingPunct(text, hit.start, hit.end);
          edits = [{ start: cut.start, end: cut.end, text: "", pri: 4 }];
          advice = "删掉「" + hit.phrase + "」，前后两句照样接得上。";
        }
        issues.push({
          id: "conn-" + issues.length,
          dim: "connective",
          start: hit.start,
          end: hit.end,
          snippet: hit.phrase,
          title: "连接词「" + hit.phrase + "」",
          advice: advice,
          pen: hitTotal ? score / hitTotal : 0,
          edits: edits
        });
      }

      if (dashHot) {
        for (var d = 0; d < dashHits.length && d < 3; d++) {
          issues.push({
            id: "dash-" + d,
            dim: "connective",
            start: dashHits[d].start,
            end: dashHits[d].end,
            snippet: "——",
            title: "破折号 " + dashHits.length + " 处",
            advice: "破折号用一次是强调，用多了是习惯；换成逗号或冒号。",
            pen: hitTotal ? score / hitTotal : 0,
            edits: [{ start: dashHits[d].start, end: dashHits[d].end, text: "，", pri: 4 }]
          });
        }
      }

      if (semiHot) {
        issues.push({
          id: "semi-0",
          dim: "connective",
          start: semiAt >= 0 ? semiAt : null,
          end: semiAt >= 0 ? semiAt + 1 : null,
          snippet: "；",
          title: "分号串句",
          advice: "有 " + semiParas + " 段用分号把三四个分句串成一句。挑一段拆成两三个短句，读起来才不憋。",
          pen: hitTotal ? score / hitTotal : 0,
          edits: []
        });
      }

      var tip = "连接词 " + hits.length + " 处、破折号 " + dashHits.length + " 处"
        + (dashHits.length && !dashHot ? "（零星使用，不算问题）" : "") + "。";
      if (hits.length + dashCount === 0) tip = "连接词和破折号都很克制，这一项没问题。";
      else if (hits.length > 6) tip += "还有 " + (hits.length - 6) + " 处可删。";
      if (semiHot) tip += "另有 " + semiParas + " 段分号串句。";
      return {
        score: score,
        issues: issues,
        tip: tip,
        hint: "连接词 " + hits.length + " · 破折号 " + dashHits.length +
          (semiHot ? " · 分号串 " + semiParas + " 段" : "")
      };
    }

    // 挑「最该补信息的那一句」：具体信息密度最低、长度又不至于太短的句子。
    // 缺具体信息 / 缺画面感这类问题原本是全文统计，没位置可指；
    // 定位到最平淡的一句，建议才落得到实处。
    function pickFlatSentence(text, counter, minLen) {
      var sents = splitSentences(text);
      var best = null, bestDens = Infinity;
      for (var i = 0; i < sents.length; i++) {
        var s = sents[i];
        var raw = text.slice(s.start, s.end);
        var n = plainLen(raw);
        if (n < (minLen || 8)) continue;
        var dens = counter(raw) / n;
        if (dens < bestDens) { bestDens = dens; best = s; }
      }
      return best;
    }

    function pickLongestSentence(text, minLen) {
      var sents = splitSentences(text);
      var best = null, bestLen = -1;
      for (var i = 0; i < sents.length; i++) {
        var s = sents[i];
        var n = plainLen(text.slice(s.start, s.end));
        if (n < (minLen || 8)) continue;
        if (n > bestLen) { bestLen = n; best = s; }
      }
      return best;
    }

    function snippetOfSentence(text, box) {
      if (!box) return "";
      var raw = text.slice(box.start, box.end).replace(/\s+/g, " ").trim();
      return raw.length > 30 ? raw.slice(0, 30) + "…" : raw;
    }

    function countConcreteGeneral(raw) {
      var digits = raw.match(/[0-9０-９]+/g) || [];
      var latin = raw.match(/[A-Za-z][A-Za-z0-9.+#_-]{1,}/g) || [];
      var quoted = raw.match(/[「“][^」”]{2,12}[」”]/g) || [];
      var times = raw.match(/[0-9]{1,2}\s*月|[0-9]{1,2}\s*日|上午|下午|凌晨|昨天|前天|上周|周[一二三四五六日天]/g) || [];
      return digits.length + latin.length + quoted.length + times.length;
    }

    function countConcreteFiction(raw) {
      var quotes = raw.match(/[「“][^」”]{1,80}[」”]/g) || [];
      var digits = raw.match(/[0-9０-９]+/g) || [];
      return quotes.length * 2 + digits.length +
        countWord(raw, FICTION_SENSE) +
        countWord(raw, FICTION_ACTION) * 0.7 +
        countWord(raw, FICTION_BODY) * 0.8 +
        countWord(raw, FICTION_OBJECT) * 0.8;
    }

    // 这一句「讲」了多少：情绪词、判断词。
    function countTellFiction(raw) {
      return countWord(raw, FICTION_TELL);
    }

    // 挑「最该补细节 / 补画面」的那一句：讲得多、现得少的那句。
    // 只看「具体词最少」会挑错——一句画面很好的短句（「表盘指针顿了一下，落回刻度原点。」）
    // 也可能一个词表词都不命中，于是被判成全文最平淡。改成「讲的分 − 现的分」，
    // 纯画面句会得负分，自然落选。
    // withObjects：把具体物件也算作「现」，通用模式用得上（说明文里也讲究东西写得实）。
    function pickWeakSentence(text, minLen, counter, withObjects) {
      var sents = splitSentences(text);
      var best = null, bestScore = -Infinity;
      for (var i = 0; i < sents.length; i++) {
        var s = sents[i];
        var raw = text.slice(s.start, s.end);
        var n = plainLen(raw);
        if (n < (minLen || 8)) continue;
        var show = counter(raw) + (withObjects ? countWord(raw, FICTION_OBJECT) * 0.5 : 0);
        var sc = (countTellFiction(raw) * 3 - show * 2) / n;
        if (sc > bestScore) { bestScore = sc; best = s; }
      }
      return best;
    }

    function dimDetail(text, chars, mode) {
      if (mode === "fiction") return dimDetailFiction(text, chars);
      var digits = text.match(/[0-9０-９]+/g) || [];
      var years = text.match(/(?:19|20)[0-9]{2}\s*年/g) || [];
      var latin = text.match(/[A-Za-z][A-Za-z0-9.+#_-]{1,}/g) || [];
      var quoted = text.match(/[「“][^」”]{2,12}[」”]/g) || [];
      var times = text.match(/[0-9]{1,2}\s*月|[0-9]{1,2}\s*日|上午|下午|凌晨|昨天|前天|上周|周[一二三四五六日天]/g) || [];
      var concrete = digits.length + latin.length + quoted.length + times.length;
      var per100 = chars > 0 ? (concrete / chars) * 100 : 0;
      var score = clamp(100 - per100 * 22, 0, 100);

      var issues = [];
      if (score >= 70 && chars >= 40) {
        var flat = pickWeakSentence(text, 8, countConcreteGeneral, true);
        issues.push({
          id: "detail-0",
          dim: "detail",
          start: flat ? flat.start : null,
          end: flat ? flat.end : null,
          snippet: snippetOfSentence(text, flat),
          soft: true,
          title: "缺具体信息",
          advice: "这一句没有一个能查证的东西。比如「很多人」可以写成「上周三来的三个人」，可信度立刻不一样。",
          edits: []
        });
      }
      var hint = "数字 " + digits.length + " · 专名 " + latin.length +
        " · 时间 " + times.length + (years.length ? " · 年份 " + years.length : "");
      var tip = score >= 70
        ? "全文只有 " + concrete + " 处具体信息，试着每段补一个。"
        : "具体信息够用，这一项没问题。";
      return { score: score, issues: issues, tip: tip, hint: hint };
    }

    // 小说里的「具体」不是数字和专名，是能被看见、听见、摸到的东西：对白、动作、
    // 身体反应、感官词。AI 写小说最典型的失败是「故事梗概腔」——情绪全说了，画面一个没有。
    var FICTION_SENSE = [
      "声音", "气味", "味道", "光", "影子", "冷", "热", "疼", "痛", "烫", "凉", "湿",
      "腥", "甜", "苦", "酸", "麻", "抖", "颤", "晃", "刺", "痒", "粗糙", "冰凉", "刺鼻",
      "耳边", "鼻尖", "舌尖", "指腹", "掌心"
    ];
    var FICTION_ACTION = [
      "走", "跑", "抓", "摔", "推", "拉", "抬", "低", "转", "攥", "拽", "踢", "拍", "踩",
      "坐", "站", "躺", "扑", "扔", "甩", "捏", "按", "敲", "爬", "蹲", "捂", "抱", "咬",
      "咽", "喘", "咳", "笑", "哭", "喊", "骂", "盯", "瞪", "瞥", "掀", "扯", "顿", "落",
      "停", "垂", "松", "收", "缩", "靠", "挪", "退", "弯", "扭", "抹", "擦", "摸", "碰",
      "触", "点", "摇", "蹦", "跳", "迈", "跨", "冲", "追", "躲", "藏", "撸", "蹭", "掩",
      "搁", "压", "扣", "回头", "低头", "抬头"
    ];
    // 具体物件：小说里的画面感很大一部分来自「看得见的东西」，而不是形容词。
    // 不把这类词算进去，就会出现「表盘指针顿了一下，落回刻度原点」被判成没画面的事。
    var FICTION_OBJECT = [
      "表盘", "指针", "刻度", "桌面", "桌角", "杯沿", "杯子", "茶缸", "窗台", "窗户",
      "门缝", "门把", "钥匙", "锁孔", "灯泡", "灯罩", "影子", "玻璃", "镜子", "烟头",
      "火柴", "打火机", "手机", "屏幕", "键盘", "硬币", "钱包", "刀刃", "伤口", "绷带",
      "雪", "雨", "风", "树", "树枝", "叶子", "墙", "墙角", "地板", "地砖",
      "台阶", "楼梯", "走廊", "门槛", "车轮", "后视镜", "方向盘", "枕头", "被子", "袖口",
      "领口", "口袋", "鞋底", "泥", "尘土", "纸页", "钢笔", "墨水", "信封", "邮票",
      "照片", "绳子", "铁盒", "布袋", "石头", "河水", "月亮"
    ];
    var FICTION_BODY = [
      "眼睛", "眼底", "眼角", "嘴角", "眉头", "眉心", "喉咙", "指尖", "手心", "后背",
      "肩膀", "脖子", "胸口", "下巴", "额头", "牙齿", "手指", "手腕", "膝盖", "骨头"
    ];
    // 「讲」而不是「现」：这些词说明作者在替读者总结情绪，而不是让读者看见。
    // 只用来挑「最该补画面」的那一句，不参与打分。
    var FICTION_TELL = [
      "不安", "紧张", "害怕", "担心", "难受", "舒服", "开心", "难过", "生气", "高兴",
      "失望", "尴尬", "无奈", "情绪", "心情", "感觉", "觉得", "心里", "想着", "意识到",
      "感到", "似乎", "大概", "总之", "复杂", "平静", "放松", "沉重", "压抑", "委屈",
      "愤怒", "恐惧", "兴奋", "激动", "说不上来", "不太好", "不对劲"
    ];
    function countWord(text, list) {
      var n = 0;
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        var from = 0;
        while (true) {
          var at = text.indexOf(w, from);
          if (at < 0) break;
          n++;
          from = at + w.length;
        }
      }
      return n;
    }

    // 同一个词在文里出现几次不算「几个词」：数的是「有几种」。
    function countDistinctWord(text, list) {
      var n = 0;
      for (var i = 0; i < list.length; i++) {
        if (text.indexOf(list[i]) >= 0) n++;
      }
      return n;
    }

    // 挑「动作最多」的那一句：给「动作罗列」定位用。
    function pickActionSentence(text) {
      var sents = splitSentences(text);
      var best = null, bestN = 0;
      for (var i = 0; i < sents.length; i++) {
        var raw = text.slice(sents[i].start, sents[i].end);
        var n = countWord(raw, FICTION_ACTION);
        if (n > bestN) { bestN = n; best = sents[i]; }
      }
      return best;
    }

    function dimDetailFiction(text, chars) {
      var quotes = text.match(/[「“][^」”]{1,80}[」”]/g) || [];
      var quoteChars = 0;
      for (var q = 0; q < quotes.length; q++) quoteChars += plainLen(quotes[q]);
      var digits = text.match(/[0-9０-９]+/g) || [];
      var sense = countWord(text, FICTION_SENSE);
      var act = countWord(text, FICTION_ACTION);
      var body = countWord(text, FICTION_BODY);
      var obj = countWord(text, FICTION_OBJECT);
      var objDistinct = countDistinctWord(text, FICTION_OBJECT);
      // 同一个动作反复写（抬手…抬手…抬手）不算画面，最多按「不同动作 ×2」算。
      var actDistinct = countDistinctWord(text, FICTION_ACTION);
      var actRaw = act;
      if (act > actDistinct * 2) act = actDistinct * 2;

      // 「画面感」的本义是读者能看见、能听见、能摸到的东西。所以真正算数的只有：
      // 对白、感官、数字。动作和道具只是陪衬——一串「抬手、转一圈、推窗、关窗」写完，
      // 读者其实什么也没看见，不该因为动作词多就被判成「画面够具体」。
      // 权重按这个次序压：对白 2 > 感官 1.2 > 数字 1 > 身体 0.3 > 物件 0.25 > 动作 0.05。
      var concrete = quotes.length * 2 + digits.length + sense * 1.2 +
        body * 0.3 + obj * 0.25 + act * 0.05;
      var per100 = chars > 0 ? (concrete / chars) * 100 : 0;
      var score = clamp(100 - per100 * 8, 0, 100);
      // 密度类分数在短文本上噪声很大：三十个字里没写感官，不代表整段没画面。
      // 篇幅不够时把分数往中性 50 拉一点，写满一百二十字才完全采信原始分。
      var conf = clamp(chars / 120, 0, 1);
      score = clamp(score * conf + 50 * (1 - conf), 0, 100);
      // 快节奏场景（抢修、打斗、对白交锋）：动作分散在一串短句里推进，
      // 这种文字的画面感来自节奏，不该按「每百字有多少名词」来量。
      var actSentCount = (text.match(/[。！？!?]/g) || []).length || 1;
      var fastScene = chars >= 60 && actRaw >= 5 && (actRaw / actSentCount) >= 0.8 &&
        (chars / actSentCount) <= 12;
      if (fastScene) score = clamp(score * 0.6, 0, 100);
      var talkRatio = chars > 0 ? quoteChars / chars : 0;

      var issues = [];
      // 动作罗列：动作不少，却几乎没有感官、也没有对白，而且全文没有一句是在替读者总结
      // （有总结的时候「缺画面感」那条会更准，能指到总结句上）。这不是模糊判断，
      // 是能指着具体句子说的机械堆砌，所以单独一条。
      // 机械罗列的特征是「一句话里堆好几个动作」。如果动作是分散在一串短句里
      // （抢修、打斗这种快节奏），那是场景推进，不是罗列；场景里有几件具体东西撑着
      // （按钮、铁屑、机器）同样不算。两条都豁免。
      var actPerSent = actRaw / actSentCount;
      var actStack = chars >= 60 && actRaw >= 6 && actPerSent >= 2.5 &&
        objDistinct < 3 && sense <= 1 && quotes.length === 0 &&
        countTellFiction(text) === 0;
      if (!actStack && score >= 70 && chars >= 60) {
        var flat = pickWeakSentence(text, 8, countConcreteFiction);
        issues.push({
          id: "detail-0",
          dim: "detail",
          start: flat ? flat.start : null,
          end: flat ? flat.end : null,
          snippet: snippetOfSentence(text, flat),
          soft: true,
          title: "缺画面感",
          advice: "这一句是在替读者总结，不是让读者看见。比如不写「他很紧张」，写「他把杯沿捏出一圈白印」——情绪藏在动作里。",
          edits: []
        });
      }
      // 整段没有对白，是 AI 小说最常见的叙述痕迹（写的是梗概，不是场景）
      if (chars >= 200 && talkRatio < 0.06 && quotes.length <= 1) {
        var longest = pickLongestSentence(text, 10);
        issues.push({
          id: "detail-talk",
          dim: "detail",
          start: longest ? longest.start : null,
          end: longest ? longest.end : null,
          snippet: snippetOfSentence(text, longest),
          soft: true,
          title: "整段没有对白",
          advice: "挑一个场景让人物开口说一句话，哪怕只有五个字。对白能把叙述拉回现场。",
          edits: []
        });
      }

      if (actStack) {
        var actPick = pickActionSentence(text);
        issues.push({
          id: "detail-act",
          dim: "detail",
          start: actPick ? actPick.start : null,
          end: actPick ? actPick.end : null,
          snippet: snippetOfSentence(text, actPick),
          soft: true,
          title: "动作罗列",
          advice: "这几句全是动作，没有一样东西是读者能看见的。挑一个动作停下来，写手碰到的东西、听见的声音，或者让人说一句话。",
          edits: []
        });
      }

      var hint = "对白 " + quotes.length + " 段 · 动作 " + actRaw +
        " · 物件 " + objDistinct + " 种 · 感官 " + sense +
        (fastScene ? " · 快节奏" : "");
      var tip = score >= 70
        ? "这一段情绪都说了，画面几乎没有。写一个瞬间：他做了什么、手碰到什么、空气里有什么味道。"
        : "画面够具体，这一项没问题。";
      return { score: score, issues: issues, tip: tip, hint: hint };
    }

    // 每个二元组跨了多少个不同的句子（一次遍历，避免对每个二元组都扫一遍全文）
    function bigramSpread(sentences) {
      var out = {};
      for (var i = 0; i < sentences.length; i++) {
        var cjk = sentences[i].text.match(/[\u4e00-\u9fa5]/g) || [];
        var seen = {};
        for (var j = 0; j < cjk.length - 1; j++) {
          var g = cjk[j] + cjk[j + 1];
          if (seen[g]) continue;
          seen[g] = 1;
          out[g] = (out[g] || 0) + 1;
        }
      }
      return out;
    }

    // 某个二元组在多少个不同的句子里出现过
    function spreadOf(sentences, gram) {
      var n = 0;
      for (var i = 0; i < sentences.length; i++) {
        if (sentences[i].text.indexOf(gram) >= 0) n++;
      }
      return n;
    }

    // 同义反复：相邻三句里，有两句在讲同一件事（共享情绪词，或共享两个以上实词）。
    // 这是 AI 改稿最常见的毛病——一句话的意思被拆成三句换着说法讲一遍。
    function findRedundant(text, sentences) {
      var out = [];
      if (!sentences || sentences.length < 2) return out;
      var sets = [];
      for (var i = 0; i < sentences.length; i++) {
        var raw = sentences[i].text;
        var cjk = raw.match(/[\u4e00-\u9fa5]/g) || [];
        var set = {};
        for (var j = 0; j < cjk.length - 1; j++) {
          var g = cjk[j] + cjk[j + 1];
          if (STOP_BIGRAMS[g]) continue;
          // 「他把」「把工」这种是跨词切片，不是共享的词
          if (FUNC_CHARS[cjk[j]] || FUNC_CHARS[cjk[j + 1]]) continue;
          set[g] = 1;
        }
        sets.push(set);
      }
      var used = {};
      for (var a = 0; a < sentences.length; a++) {
        for (var b = a + 1; b < sentences.length && b <= a + 3; b++) {
          var shared = [];
          for (var key in sets[b]) {
            if (sets[b][key] && sets[a][key]) shared.push(key);
          }
          if (!shared.length) continue;
          var moodHit = false;
          for (var m = 0; m < MOOD_WORDS.length; m++) {
            if (sentences[a].text.indexOf(MOOD_WORDS[m]) >= 0 &&
                sentences[b].text.indexOf(MOOD_WORDS[m]) >= 0) { moodHit = true; break; }
          }
          // 共享的这个词如果跨了三句以上，那是术语复现（「工件」这种），不是同义反复
          if (!moodHit) {
            var termish = false;
            for (var t = 0; t < shared.length; t++) {
              if (spreadOf(sentences, shared[t]) >= 3) { termish = true; break; }
            }
            if (termish) continue;
          }
          if (!moodHit && shared.length < 2) continue;
          var sig = "re-" + b;
          if (used[sig]) continue;
          used[sig] = 1;
          var word = moodHit ? (function () {
            for (var q = 0; q < MOOD_WORDS.length; q++) {
              if (sentences[a].text.indexOf(MOOD_WORDS[q]) >= 0 &&
                  sentences[b].text.indexOf(MOOD_WORDS[q]) >= 0) return MOOD_WORDS[q];
            }
            return shared[0];
          })() : shared[0];
          out.push({
            id: sig,
            dim: "diversity",
            start: sentences[b].start,
            end: sentences[b].end,
            snippet: snippetOf(sentences[b].text),
            soft: true,
            title: "同义反复「" + word + "」",
            advice: "这句和前面那句说的是同一件事，挑一句留下，另一句换成新的信息。",
            edits: []
          });
          if (out.length >= 2) return out;
        }
      }
      return out;
    }

    function dimDiversity(text, sentences) {
      var cjk = text.match(/[\u4e00-\u9fa5]/g) || [];
      if (cjk.length < 20) {
        return { score: 0, issues: [], tip: "文字太少，无法判断用词重复。", hint: "" };
      }
      var bigrams = {}, total = 0, i;
      for (i = 0; i < cjk.length - 1; i++) {
        var k = cjk[i] + cjk[i + 1];
        bigrams[k] = (bigrams[k] || 0) + 1;
        total++;
      }

      // 术语/专名先摘出来：同一个搭配在三个以上不同句子里分散出现、
      // 平均每句不到两次、且没占到全部二元组的一成以上，就是专业场景的正常复现
      // （写机加工不可能换着叫「工件」）。
      // 关键点：术语既不该按「用词重复」扣分，**也不该被算进去重率**——
      // 否则术语用得越准，去重率越低，分反而越高，专业场景永远吃亏。
      var spreads = sentences ? bigramSpread(sentences) : {};
      var termSet = {}, termHits = [], distinct = 0;
      for (var key in bigrams) {
        if (!Object.prototype.hasOwnProperty.call(bigrams, key)) continue;
        distinct++;
        var cnt = bigrams[key];
        var sp = spreads[key] || 0;
        if (cnt >= 3 && sp >= 3 && cnt / sp <= 2 && cnt / total <= 0.12) {
          termSet[key] = 1;
          termHits.push({ key: key, count: cnt, spread: sp });
        }
      }
      termHits.sort(function (a, b) { return b.count - a.count; });

      // 只用「非术语」的二元组算去重率与最高频搭配
      var adjTotal = 0, maxKey = "", maxCount = 0;
      for (var key2 in bigrams) {
        if (!Object.prototype.hasOwnProperty.call(bigrams, key2)) continue;
        if (termSet[key2]) continue;
        adjTotal += bigrams[key2];
        if (bigrams[key2] > maxCount) { maxCount = bigrams[key2]; maxKey = key2; }
      }
      var adjDistinct = distinct - termHits.length;
      var ttr = adjTotal > 0 ? adjDistinct / adjTotal : 1;
      var score = clamp(((0.92 - ttr) / 0.37) * 100, 0, 100);
      var termLike = termHits.length > 0;

      if (maxCount >= 4 && maxCount / Math.max(1, adjTotal) > 0.035) score = clamp(score + 12, 0, 100);

      var issues = [];
      if (maxCount >= 4 && maxKey && maxCount / Math.max(1, adjTotal) > 0.035) {
        var at = text.indexOf(maxKey);
        issues.push({
          id: "repeat-0",
          dim: "diversity",
          start: at >= 0 ? at : null,
          end: at >= 0 ? at + maxKey.length : null,
          snippet: maxKey,
          title: "「" + maxKey + "」重复 " + maxCount + " 次",
          advice: "这个搭配出现太多次，换一种说法或直接删掉一处。",
          edits: []
        });
      }

      // 表达重复（同义反复）：和「词汇重复」是两件事——那边是同一个词用太多次，
      // 这边是同一件事换着说法讲了两三遍。
      var redundant = findRedundant(text, sentences);
      for (var r = 0; r < redundant.length; r++) issues.push(redundant[r]);
      if (redundant.length) score = clamp(score + redundant.length * 14, 0, 100);

      var tip;
      if (redundant.length) {
        tip = "有 " + redundant.length + " 处换着说法重复同一件事，删掉一句会紧凑很多。";
      } else if (termLike) {
        tip = "有 " + termHits.length + " 个搭配像术语复现（「" + termHits[0].key + "」出现 " +
          termHits[0].count + " 次、跨 " + termHits[0].spread + " 句），已从去重率里摘出来，不算重复。";
      } else if (maxCount >= 4 && maxKey) {
        tip = "重复最多的搭配是「" + maxKey + "」（" + maxCount + " 次）。";
      } else {
        tip = "用词重复不明显，这一项没问题。";
      }
      return {
        score: score,
        issues: issues,
        tip: tip,
        hint: "去重率 " + Math.round(ttr * 100) + "%" + (termLike ? " · 术语 " + termHits.length + " 个" : "")
      };
    }

    // 情绪/状态类词：同一批词在相邻几句里反复出现，多半是在换着说法讲同一件事
    // （「他有些疲惫」「他已经撑不住了」「疲惫正在吞噬精力」）。这类同义反复本地能测，
    // 不需要模型也能指着句子说清楚。
    var MOOD_WORDS = [
      "疲惫", "疲倦", "疲劳", "累", "困", "害怕", "恐惧", "紧张", "焦虑", "难过", "伤心",
      "高兴", "开心", "生气", "愤怒", "无奈", "绝望", "孤独", "寂寞", "平静", "冷静",
      "痛苦", "兴奋", "激动", "尴尬", "犹豫", "迟疑", "慌乱", "不安", "心虚", "得意",
      "失落", "沮丧", "烦恼", "烦躁", "烦燥", "压抑", "沉重", "轻松", "温暖", "冰冷"
    ];

    // 虚词字：一个二元组里只要有这些字，基本就是「他把」「把工」这种跨词切片，
    // 不是真正共享的词，不能拿来判同义反复。
    var FUNC_CHARS = {
      "把": 1, "被": 1, "对": 1, "将": 1, "给": 1, "让": 1, "向": 1, "从": 1, "在": 1,
      "是": 1, "和": 1, "与": 1, "的": 1, "了": 1, "着": 1, "过": 1, "就": 1, "都": 1,
      "也": 1, "还": 1, "又": 1, "很": 1, "更": 1, "最": 1, "不": 1, "没": 1, "有": 1,
      "他": 1, "她": 1, "它": 1, "我": 1, "你": 1, "这": 1, "那": 1, "上": 1, "下": 1,
      "里": 1, "中": 1, "个": 1, "些": 1, "么": 1, "之": 1, "其": 1, "而": 1, "且": 1,
      "才": 1, "再": 1, "会": 1, "能": 1, "要": 1, "到": 1, "去": 1, "来": 1, "一": 1
    };

    // 二元组停用表：这些组合几乎每句都有，共享它们不算重复表达。
    var STOP_BIGRAMS = {
      "的是": 1, "了的": 1, "了了": 1, "一下": 1, "一个": 1, "这个": 1, "那个": 1,
      "他的": 1, "她的": 1, "我的": 1, "你的": 1, "他们": 1, "我们": 1, "你们": 1,
      "自己": 1, "什么": 1, "没有": 1, "已经": 1, "还是": 1, "就是": 1, "不是": 1,
      "可以": 1, "因为": 1, "所以": 1, "但是": 1, "如果": 1, "然后": 1, "现在": 1,
      "时候": 1, "地方": 1, "东西": 1, "这样": 1, "那样": 1, "一样": 1, "起来": 1,
      "出来": 1, "过去": 1, "下来": 1, "上来": 1, "一下": 1, "一点": 1, "一些": 1,
      "有些": 1, "有点": 1, "只是": 1, "不过": 1, "而且": 1, "或者": 1, "虽然": 1
    };

    /* ------------------------------------------------------------------ *
     * Rewrite assembly + full analysis
     * ------------------------------------------------------------------ */

    function buildRewrite(text, issues, extraEdits) {
      var cands = [];
      for (var i = 0; i < issues.length; i++) {
        var edits = issues[i].edits;
        if (!edits || !edits.length) continue;
        for (var e = 0; e < edits.length; e++) {
          var ed = edits[e];
          if (typeof ed.start !== "number" || ed.start < 0) continue;
          cands.push({ start: ed.start, end: ed.end, text: ed.text, pri: ed.pri || 1 });
        }
      }
      if (extraEdits) {
        for (var x = 0; x < extraEdits.length; x++) {
          var ex = extraEdits[x];
          if (typeof ex.start !== "number" || ex.start < 0) continue;
          cands.push({ start: ex.start, end: ex.end, text: ex.text, pri: ex.pri || 1 });
        }
      }
      cands.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
      var accepted = [];
      for (var c = 0; c < cands.length; c++) {
        var cand = {
          start: cands[c].start,
          end: cands[c].end,
          text: cands[c].text,
          pri: cands[c].pri
        };
        var overlap = false;
        for (var a = 0; a < accepted.length; a++) {
          var acc = accepted[a];
          if (!(cand.start < acc.end && acc.start < cand.end)) continue;

          if (cand.text === "") {
            // 本地删除碰上模型的整句改写：改写优先，删除让路。
            // 否则删除会把改写一起吞掉，只留下孤零零的标点。
            if (acc.text !== "" && acc.pri > cand.pri) { overlap = true; break; }
            // 删除优先：重叠的本地替换（比如「然而」换成「但」）一起吞掉并扩大删除区间，
            // 否则会把后面的套话漏下来，改完反而和诊断建议对不上。
            if (acc.start < cand.start) cand.start = acc.start;
            if (acc.end > cand.end) cand.end = acc.end;
            accepted.splice(a, 1);
            a--;
            continue;
          }

          if (acc.text === "" && cand.pri >= acc.pri
            && cand.start <= acc.start && cand.end >= acc.end) {
            // 模型给的整句改写盖住了本地要删的套话：留改写，不删。
            accepted.splice(a, 1);
            a--;
            continue;
          }

          if (acc.text !== "" && cand.pri > acc.pri) {
            // 两个都是改写时看优先级：模型整句改写（pri6）压过本地断句/替换（pri2/4）。
            accepted.splice(a, 1);
            a--;
            continue;
          }


          overlap = true;
          break;
        }
        if (!overlap) accepted.push(cand);
      }
      return { text: applyEdits(text, accepted), applied: accepted.length };
    }

    function buildSegments(text, issues) {
      var spans = [];
      for (var i = 0; i < issues.length; i++) {
        var it = issues[i];
        if (typeof it.start === "number" && it.start >= 0 && it.end > it.start) spans.push(it);
      }
      if (!spans.length) return [{ text: text }];

      // 按所有 span 的边界切成原子片段，每个片段归给「最内层」的那个问题。
      // 这样句子级的问题（缺具体信息/缺画面感）可以当底色，句子里的词级问题
      // （套话、连接词）仍然能单独着色，不会被大区间吞掉。
      var cuts = [0, text.length];
      for (var s = 0; s < spans.length; s++) {
        if (spans[s].start > 0 && spans[s].start < text.length) cuts.push(spans[s].start);
        if (spans[s].end > 0 && spans[s].end < text.length) cuts.push(spans[s].end);
      }
      cuts.sort(function (a, b) { return a - b; });
      var uniq = [];
      for (var c = 0; c < cuts.length; c++) {
        if (!uniq.length || uniq[uniq.length - 1] !== cuts[c]) uniq.push(cuts[c]);
      }

      var out = [];
      for (var u = 0; u + 1 < uniq.length; u++) {
        var from = uniq[u], to = uniq[u + 1];
        if (to <= from) continue;
        var best = null;
        for (var k = 0; k < spans.length; k++) {
          var sp = spans[k];
          if (sp.start <= from && sp.end >= to) {
            if (!best || (sp.end - sp.start) < (best.end - best.start)) best = sp;
          }
        }
        var prev = out.length ? out[out.length - 1] : null;
        if (prev && prev.issue && best && prev.issue.id === best.id) {
          prev.text += text.slice(from, to);
        } else if (prev && !prev.issue && !best) {
          prev.text += text.slice(from, to);
        } else {
          out.push(best ? { text: text.slice(from, to), issue: best } : { text: text.slice(from, to) });
        }
      }
      return out;
    }

    // 取命中片段所在的整句（标点为准），用于建议卡片里的「原句」
    function sentenceBox(text, sentences, start, end) {
      if (typeof start !== "number" || start < 0) return null;
      var si = sentIndexAt(sentences, start);
      if (si < 0) return null;
      var s = sentences[si];
      var zero = s.text.replace(/\s/g, "").length === 0;
      if (zero) return null;
      return { start: s.start, end: s.end, text: s.text };
    }

    // 把该问题的改写编有限地落到句内，得到「改成」的预览文本
    function rewriteSentence(box, edits) {
      if (!box || !edits || !edits.length) return "";
      var local = [], i, e, a, b;
      for (i = 0; i < edits.length; i++) {
        e = edits[i];
        if (e.start === e.end) {
          if (e.start >= box.start && e.start <= box.end) {
            local.push({ start: e.start - box.start, end: e.start - box.start, text: e.text });
          }
          continue;
        }
        a = Math.max(e.start, box.start);
        b = Math.min(e.end, box.end);
        if (b <= a) continue;
        local.push({ start: a - box.start, end: b - box.start, text: e.text });
      }
      if (!local.length) return "";
      return applyEdits(box.text, local);
    }

    // 问题指纹：分项 + 原文片段。忽略、两版对比都靠它认同一处问题。
    function sigOf(issue) {
      return (issue.dim || "?") + "|" + (issue.snippet == null ? "" : String(issue.snippet));
    }

    function dimOrderOf(dim) {
      var order = { cliche: 0, uniformity: 1, parallel: 2, connective: 3, detail: 4, diversity: 5 };
      return order[dim] == null ? 9 : order[dim];
    }

    // 纯规则层：只算原始分与问题，不处理忽略、不拼分段
    function rawAnalysis(text, mode, opts) {
      var md = MODES[mode] ? mode : DEFAULT_MODE;
      var cfg = MODES[md];
      var W = cfg.w;
      var L = cfg.labels;
      var custom = (opts && opts.custom) || EMPTY_CUSTOM;
      var chars = charCount(text);
      var sentences = splitSentences(text);
      var paragraphs = splitParagraphs(text);
      var valid = chars >= MIN_CHARS;

      var parts = [
        { key: "cliche", label: L.cliche, w: W.cliche, r: dimCliche(text, chars, sentences, md, custom) },
        { key: "uniformity", label: L.uniformity, w: W.uniformity, r: dimUniform(text, sentences, paragraphs) },
        { key: "parallel", label: L.parallel, w: W.parallel, r: dimParallel(text, sentences, paragraphs) },
        { key: "connective", label: L.connective, w: W.connective, r: dimConnective(text, chars, paragraphs, md, custom) },
        { key: "detail", label: L.detail, w: W.detail, r: dimDetail(text, chars, md) },
        { key: "diversity", label: L.diversity, w: W.diversity, r: dimDiversity(text, sentences) }
      ];

      var issues = [], tips = [], dims = [];
      for (var p = 0; p < parts.length; p++) {
        var part = parts[p];
        var score = valid ? Math.round(clamp(part.r.score, 0, 100)) : 0;
        dims.push({ key: part.key, label: part.label, w: part.w, raw: score, score: score, hint: part.r.hint || "" });
        if (part.r.issues && part.r.issues.length) {
          for (var i = 0; i < part.r.issues.length; i++) issues.push(part.r.issues[i]);
        } else if (valid) {
          tips.push({ dim: part.key, label: part.label, text: part.r.tip });
        }
      }
      var hidden = [];
      for (var q = 0; q < parts.length; q++) {
        var hx = parts[q].r.extraEdits;
        if (hx && hx.length) hidden = hidden.concat(hx);
      }

      issues.sort(function (a, b) {
        var da = dimOrderOf(a.dim);
        var db = dimOrderOf(b.dim);
        if (da !== db) return da - db;
        return (a.start == null ? -1 : a.start) - (b.start == null ? -1 : b.start);
      });

      return {
        valid: valid,
        mode: md,
        chars: chars,
        sentCount: sentences.length,
        paraCount: paragraphs.length,
        avgLen: sentences.length ? Math.round(stats(sentences.map(function (s) { return plainLen(s.text); })).mean) : 0,
        dims: dims,
        issues: issues,
        tips: tips,
        hidden: hidden
      };
    }

    // 收尾：应用「忽略」、按权重算总分、拼分段与改写
    function finishAnalysis(text, o) {
      var ignore = o.ignore || EMPTY_IGNORE;
      var offDims = ignore.dims || {};
      var offItems = ignore.items || {};
      var i, j;

      var issues = [];
      for (i = 0; i < o.issues.length; i++) {
        var it = o.issues[i];
        issues.push({
          id: it.id,
          dim: it.dim,
          start: it.start,
          end: it.end,
          snippet: it.snippet,
          title: it.title,
          advice: it.advice,
          edits: it.edits,
          soft: !!it.soft,
          pen: it.pen || 0,
          ignored: !!offItems[sigOf(it)]
        });
      }

      var dims = [], localTotal = 0, wsum = 0, sem = null;
      for (i = 0; i < o.dims.length; i++) {
        var d = o.dims[i];
        var pen = 0;
        for (j = 0; j < issues.length; j++) {
          if (issues[j].dim === d.key && issues[j].ignored) pen += issues[j].pen;
        }
        var raw = d.raw == null ? d.score : d.raw;
        // 忽略一条 = 这条我确认了、不算问题，所以要从本分项里减掉它占的那份分
        var sc = clamp(raw - pen, 0, 100);
        var isOff = !!offDims[d.key];
        var entry = {
          key: d.key,
          label: d.label,
          score: Math.round(sc),
          w: d.w || 0,
          hint: d.hint || "",
          ignored: isOff,
          source: d.source
        };
        dims.push(entry);
        if (d.source === "model") { sem = entry; continue; }
        if (!isOff && entry.w > 0) { localTotal += sc * entry.w; wsum += entry.w; }
      }

      var score100 = 0;
      if (o.valid) {
        var local = wsum > 0 ? localTotal / wsum : 0;
        if (sem && !sem.ignored) score100 = Math.round(clamp(local * (1 - SEMANTIC_W) + sem.score * SEMANTIC_W, 0, 100));
        else score100 = Math.round(clamp(local, 0, 100));
      }

      var live = [];
      for (i = 0; i < issues.length; i++) if (!issues[i].ignored) live.push(issues[i]);

      var out = {
        valid: o.valid,
        mode: o.mode,
        score: score100,
        tone: toneOf(score100),
        chars: o.chars,
        sentCount: o.sentCount,
        paraCount: o.paraCount,
        avgLen: o.avgLen,
        dims: dims,
        issues: issues,
        live: live,
        ignoredCount: issues.length - live.length,
        tips: o.tips,
        hidden: o.hidden || [],
        reviewed: !!o.reviewed,
        segments: [],
        rewrite: { text: text, applied: 0 }
      };
      if (!o.light) {
        out.segments = buildSegments(text, live);
        out.rewrite = buildRewrite(text, live, out.hidden);
      }
      out.raw = o;
      return out;
    }

    function analyze(text, mode, opts, light) {
      var o = rawAnalysis(text, mode, opts);
      o.ignore = (opts && opts.ignore) || EMPTY_IGNORE;
      o.light = !!light;
      return finishAnalysis(text, o);
    }

    /* ------------------------------------------------------------------ *
     * 模型复审：把大模型指出的语义层问题并进同一份分析
     * ------------------------------------------------------------------ */

    var SEM_TYPE = { empty: "空泛", logic: "逻辑", translation: "翻译腔", tone: "语气", structure: "结构" };
    // 小说复审的类别不同：AI 写小说的问题主要是「讲述代替呈现」和「对白扁平」。
    var SEM_TYPE_FICTION = { empty: "空泛", tell: "讲述", cliche: "套句", flat: "对白", logic: "逻辑", tone: "语气", translation: "翻译腔", structure: "结构" };
    var END_PUNCT = "。！？";
    var FILLER_PUNCT = "，。；：、！？";

    // 复审只指认片段，分数仍由本地按条数与严重度确定性地折算：
    // 同一段文本、同一批结论，分数一定一样，不会因为模型换了口气就漂。
    function mergeReview(base, review, text, mode, opts) {
      if (!review || !review.ok || !base.valid) return base;
      var md = mode === "fiction" ? "fiction" : "general";
      var typeMap = md === "fiction" ? SEM_TYPE_FICTION : SEM_TYPE;
      var items = Array.isArray(review.items) ? review.items : [];
      var raw = base.raw || rawAnalysis(text, md, opts);
      // 按密度折算：同样 4 条问题，66 字里就是通篇机器味，2000 字里只是零星几处。
      // 除数下限取 1（即每 100 字）——短文本里一条问题不至于直接把分打到 0。
      var density = Math.max(1, base.chars / 100);

      var extra = [];
      var penalty = 0;
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        var quote = typeof it.quote === "string" ? it.quote : "";
        var start = quote ? text.indexOf(quote) : -1;
        if (start < 0) continue;
        var end = start + quote.length;
        // 改写已用句号收尾时，把紧跟在原句后的标点一并吃掉，否则会改出「。。」或「。，」
        if (typeof it.rewrite === "string" && it.rewrite) {
          var tail = it.rewrite.charAt(it.rewrite.length - 1);
          if (END_PUNCT.indexOf(tail) >= 0 && end < text.length && FILLER_PUNCT.indexOf(text.charAt(end)) >= 0) end += 1;
        }
        var sev = typeof it.severity === "number" ? clamp(Math.round(it.severity), 1, 3) : 2;
        var pen = 8 + 6 * sev;
        penalty += pen;
        var edits = [];
        if (typeof it.rewrite === "string" && it.rewrite && it.rewrite !== quote) {
          // pri 6：模型整句改写压过本地删除（pri5）和本地替换（pri4），
          // 否则整句会被「删除套话」吞掉，只剩孤零零的标点。
          edits.push({ start: start, end: end, text: it.rewrite, pri: 6 });
        }
        extra.push({
          id: "ai-" + i,
          dim: "semantic",
          start: start,
          end: end,
          snippet: quote,
          title: (typeMap[it.type] || "语义") + " · " + (typeof it.title === "string" && it.title ? it.title : "语义层问题"),
          advice: typeof it.advice === "string" && it.advice ? it.advice : "按上下文把这一句写得更具体。",
          pen: pen,
          edits: edits
        });
      }
      extra.sort(function (a, b) { return a.start - b.start; });

      var semScore = Math.round(clamp(100 - penalty / density, 0, 100));
      // 每条占语义层多少分：按严重度权重把语义分分摊下去，忽略一条就减掉那一份
      for (var z = 0; z < extra.length; z++) {
        extra[z].pen = penalty > 0 ? (semScore * extra[z].pen) / penalty : 0;
      }

      var dims = [];
      for (var d = 0; d < raw.dims.length; d++) {
        var rd = raw.dims[d];
        dims.push({ key: rd.key, label: rd.label, w: rd.w, raw: rd.raw == null ? rd.score : rd.raw, score: rd.score, hint: rd.hint });
      }
      dims.push({
        key: "semantic",
        label: "语义层",
        w: 0,
        raw: semScore,
        score: semScore,
        hint: extra.length ? "模型指出 " + extra.length + " 处语义问题" : "模型未发现语义问题",
        source: "model"
      });

      var merged = {
        valid: raw.valid,
        mode: md,
        chars: raw.chars,
        sentCount: raw.sentCount,
        paraCount: raw.paraCount,
        avgLen: raw.avgLen,
        dims: dims,
        issues: raw.issues.concat(extra),
        tips: raw.tips,
        hidden: raw.hidden,
        ignore: (opts && opts.ignore) || EMPTY_IGNORE,
        reviewed: true
      };
      var out = finishAnalysis(text, merged);
      // 模型只能扣分，不能抬分：它本来只负责「挑毛病」，没挑出问题时不该把分数改高
      // （否则一段本地判 20 分的干净文字，只因为模型没意见就被抬到 34 分）。
      if (out.score > base.score) {
        out.score = base.score;
        out.tone = toneOf(out.score);
      }
      return out;
    }


    /* ------------------------------------------------------------------ *
     * 四项派生功能：最该先改的 10 句 / 两版对比 / 整章切分 / 段落热力
     * ------------------------------------------------------------------ */

    // 同一句里的问题合并成一组：改一句算一次收益
    function groupBySentence(text, analysis) {
      var sents = splitSentences(text);
      var groups = [], byKey = {};
      var list = analysis.live || analysis.issues || [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (typeof it.start !== "number") continue;
        if (!it.edits || !it.edits.length) continue;
        var si = sentIndexAt(sents, it.start);
        if (si < 0) continue;
        if (!byKey[si]) {
          byKey[si] = { si: si, start: sents[si].start, end: sents[si].end, text: sents[si].text, issues: [] };
          groups.push(byKey[si]);
        }
        byKey[si].issues.push(it);
      }
      return groups;
    }

    // 真实重算：把这一句的建议全应用上去，再跑一次分析，看分数真的掉多少
    function topFixes(text, analysis, mode, opts, limit) {
      if (!analysis || !analysis.valid) return [];
      var groups = groupBySentence(text, analysis);
      if (!groups.length) return [];
      var max = limit || TOP_LIMIT;

      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        var pri = 0;
        for (var j = 0; j < g.issues.length; j++) pri += (g.issues[j].pen || 0) + 1;
        g.pri = pri;
      }
      var cands = groups.slice().sort(function (a, b) { return b.pri - a.pri; }).slice(0, TOP_CANDIDATES);

      var base = analysis.score;
      var out = [];
      for (var k = 0; k < cands.length; k++) {
        var c = cands[k];
        var rw = buildRewrite(text, c.issues);
        if (!rw || !rw.text || rw.text === text) continue;
        var next = analyze(rw.text, mode, opts, true).score;
        var delta = base - next;
        if (delta <= 0) continue;
        out.push({
          si: c.si,
          start: c.start,
          end: c.end,
          before: c.text,
          after: rewriteSentence({ start: c.start, end: c.end, text: c.text }, collectEdits(c.issues)),
          delta: delta,
          dims: c.issues.map(function (x) { return x.dim; }),
          issues: c.issues
        });
      }
      out.sort(function (a, b) { return b.delta - a.delta; });
      return out.slice(0, max);
    }

    function collectEdits(issues) {
      var out = [];
      for (var i = 0; i < issues.length; i++) {
        var ed = issues[i].edits || [];
        for (var j = 0; j < ed.length; j++) {
          if (typeof ed[j].start !== "number" || ed[j].start < 0) continue;
          out.push({ start: ed[j].start, end: ed[j].end, text: ed[j].text, pri: ed[j].pri || 1 });
        }
      }
      return out;
    }

    // 两版对比：靠问题指纹认「修好了」和「新引入」
    function compareVersions(a, b) {
      var before = {}, after = {};
      var i, it;
      var la = (a && (a.live || a.issues)) || [];
      var lb = (b && (b.live || b.issues)) || [];
      for (i = 0; i < la.length; i++) { it = la[i]; before[sigOf(it)] = it; }
      for (i = 0; i < lb.length; i++) { it = lb[i]; after[sigOf(it)] = it; }
      var fixed = [], added = [], stay = [];
      for (i = 0; i < la.length; i++) {
        it = la[i];
        if (after[sigOf(it)]) { if (stay.indexOf(it) < 0) stay.push(it); } else fixed.push(it);
      }
      for (i = 0; i < lb.length; i++) {
        it = lb[i];
        if (!before[sigOf(it)]) added.push(it);
      }
      return {
        before: a ? a.score : 0,
        after: b ? b.score : 0,
        delta: (b ? b.score : 0) - (a ? a.score : 0),
        fixed: fixed,
        added: added,
        stay: stay
      };
    }

    // 整章切分：认「第一章 / 第 1 章 / 第十二回 / 第三节」这类标题行
    function splitChapters(text) {
      var raw = String(text || "");
      if (!raw.trim()) return [];
      var re = /^[ \t　]*(第[0-9０-９零〇一二三四五六七八九十百千万两]{1,9}[章回节卷篇][^\n]{0,40})$/gm;
      var marks = [], m;
      while ((m = re.exec(raw)) !== null) {
        marks.push({ title: m[1].trim(), start: m.index });
      }
      if (!marks.length) return [{ title: "全文", text: raw, start: 0, end: raw.length }];
      var out = [];
      if (marks[0].start > 0 && raw.slice(0, marks[0].start).trim()) {
        out.push({ title: "开头", text: raw.slice(0, marks[0].start), start: 0, end: marks[0].start });
      }
      for (var i = 0; i < marks.length; i++) {
        var end = i + 1 < marks.length ? marks[i + 1].start : raw.length;
        out.push({ title: marks[i].title, text: raw.slice(marks[i].start, end), start: marks[i].start, end: end });
      }
      return out;
    }

    // 段落热力：每段单独打一个分（轻量，不拼分段与改写）
    function paraHeat(text, mode, opts) {
      var paras = splitParagraphs(text);
      var out = [];
      for (var i = 0; i < paras.length; i++) {
        var p = paras[i];
        var body = text.slice(p.start, p.end);
        if (charCount(body) < 8) {
          out.push({ index: i, start: p.start, end: p.end, chars: charCount(body), score: null, top: [] });
          continue;
        }
        var a = analyze(body, mode, opts, true);
        var tops = [];
        for (var d = 0; d < a.dims.length; d++) {
          if (a.dims[d].ignored) continue;
          tops.push({ key: a.dims[d].key, label: a.dims[d].label, score: a.dims[d].score });
        }
        tops.sort(function (x, y) { return y.score - x.score; });
        out.push({
          index: i,
          start: p.start,
          end: p.end,
          chars: charCount(body),
          score: a.valid ? a.score : null,
          top: tops.slice(0, 3)
        });
      }
      return out;
    }

    /* ------------------------------------------------------------------ *
     * Plugin-owned persistence (profile-wide, not session-scoped)
     * ------------------------------------------------------------------ */

    function readDraft() {
      try {
        var v = window.localStorage.getItem(DRAFT_KEY);
        return typeof v === "string" ? v : "";
      } catch (e) {
        return "";
      }
    }

    function saveDraft(v) {
      try { window.localStorage.setItem(DRAFT_KEY, v || ""); } catch (e) { /* storage unavailable */ }
    }

    // 自动复审开关（默认开：用户要的是「一个分析」，不用每回手动点）
    function readAuto() {
      try {
        var v = window.localStorage.getItem(AUTO_KEY);
        return v === "0" ? false : true;
      } catch (e) {
        return true;
      }
    }

    function saveAuto(v) {
      try { window.localStorage.setItem(AUTO_KEY, v ? "1" : "0"); } catch (e) { /* storage unavailable */ }
    }

    // 文体模式：记住上次选的，下次打开还是同一个
    function readMode() {
      try {
        var v = window.localStorage.getItem(MODE_KEY);
        return v && MODES[v] ? v : DEFAULT_MODE;
      } catch (e) {
        return DEFAULT_MODE;
      }
    }

    function saveMode(v) {
      try { window.localStorage.setItem(MODE_KEY, MODES[v] ? v : DEFAULT_MODE); } catch (e) { /* storage unavailable */ }
    }

    // 把用户输入的多行/逗号分隔词表拆成数组
    function parseWords(raw) {
      var src;
      if (Array.isArray(raw)) src = raw.join("\n");
      else if (typeof raw === "string") src = raw;
      else return [];
      if (!src) return [];
      var parts = src.split(/[\n,，、;；]+/);
      var out = [], seen = {};
      for (var i = 0; i < parts.length; i++) {
        var w = parts[i].trim();
        if (!w || seen[w]) continue;
        seen[w] = true;
        out.push(w);
      }
      return out;
    }

    function readIgnore() {
      try {
        var raw = window.localStorage.getItem(IGNORE_KEY);
        if (!raw) return { items: {}, dims: {} };
        var obj = JSON.parse(raw);
        return { items: (obj && obj.items) || {}, dims: (obj && obj.dims) || {} };
      } catch (e) {
        return { items: {}, dims: {} };
      }
    }

    function saveIgnore(v) {
      try { window.localStorage.setItem(IGNORE_KEY, JSON.stringify(v || EMPTY_IGNORE)); } catch (e) { /* storage unavailable */ }
    }

    function readCustom() {
      try {
        var raw = window.localStorage.getItem(CUSTOM_KEY);
        if (!raw) return { deny: [], allow: [] };
        var obj = JSON.parse(raw);
        return { deny: parseWords(obj && obj.deny), allow: parseWords(obj && obj.allow) };
      } catch (e) {
        return { deny: [], allow: [] };
      }
    }

    function saveCustom(v) {
      try { window.localStorage.setItem(CUSTOM_KEY, JSON.stringify({ deny: (v && v.deny) || [], allow: (v && v.allow) || [] })); } catch (e) { /* storage unavailable */ }
    }

    function readTarget() {
      try {
        var v = window.localStorage.getItem(TARGET_KEY);
        var n = v == null ? NaN : Number(v);
        return isFinite(n) && n > 0 && n <= 100 ? Math.round(n) : DEFAULT_TARGET;
      } catch (e) {
        return DEFAULT_TARGET;
      }
    }

    function saveTarget(v) {
      try { window.localStorage.setItem(TARGET_KEY, String(v)); } catch (e) { /* storage unavailable */ }
    }

    function readV2() {
      try {
        var v = window.localStorage.getItem(V2_KEY);
        return typeof v === "string" ? v : "";
      } catch (e) {
        return "";
      }
    }

    function saveV2(v) {
      try { window.localStorage.setItem(V2_KEY, v || ""); } catch (e) { /* storage unavailable */ }
    }

    function readFontScale() {
      try {
        var v = window.localStorage.getItem(FONT_KEY);
        var n = v == null ? NaN : Number(v);
        return isFinite(n) && n >= 0 && n < FONT_PX.length ? Math.round(n) : FONT_DEFAULT;
      } catch (e) {
        return FONT_DEFAULT;
      }
    }

    function saveFontScale(v) {
      try { window.localStorage.setItem(FONT_KEY, String(v)); } catch (e) { /* storage unavailable */ }
    }

    function readPick() {
      try {
        var raw = window.localStorage.getItem(MODEL_KEY);
        if (!raw) return { provider: "", model: "" };
        var o = JSON.parse(raw);
        if (!o || typeof o !== "object") return { provider: "", model: "" };
        return {
          provider: typeof o.provider === "string" ? o.provider : "",
          model: typeof o.model === "string" ? o.model : ""
        };
      } catch (e) {
        return { provider: "", model: "" };
      }
    }

    function savePick(v) {
      try {
        var p = v && typeof v === "object" ? v : {};
        window.localStorage.setItem(MODEL_KEY, JSON.stringify({
          provider: typeof p.provider === "string" ? p.provider : "",
          model: typeof p.model === "string" ? p.model : ""
        }));
      } catch (e) { /* storage unavailable */ }
    }

    function readHistory() {
      try {
        var raw = window.localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        var arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.filter(function (r) {
          return r && typeof r.text === "string" && typeof r.score === "number";
        }).slice(0, HISTORY_LIMIT);
      } catch (e) {
        return [];
      }
    }

    function saveHistory(list) {
      try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
    }

    /* ------------------------------------------------------------------ *
     * Styles
     * ------------------------------------------------------------------ */

    var CSS = [
      ".asd-root{display:flex;flex-direction:column;gap:10px;padding:12px;height:100%;box-sizing:border-box;overflow-y:auto;",
      "color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55;",
      // 主题里只有 error / warn / business / success 四种状态色，「排比」和「模型复审」
      // 如果都用 business 就分不出来，这里用 color-mix 各调一个可辨识的色相。
      "--asd-c-parallel:color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,var(--dsw-alias-state-error-primary));",
      "--asd-c-semantic:color-mix(in srgb,var(--dsw-alias-state-business-primary) 52%,var(--dsw-alias-state-success-primary));",
      // This panel is transparent: the sidebar fill shows through. bg-layer-1 / bg-layer-2 are
      // defined relative to each other, not to that fill, so on a light theme they land almost
      // exactly on the panel and every card, input and tile dissolves into it.
      // Derive surfaces and lines from the label colour instead: the light theme tints darker,
      // the dark theme tints lighter, so a block keeps a visible edge on both.
      "--asd-surface:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent);",
      "--asd-surface-2:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);",
      "--asd-line:color-mix(in srgb,var(--dsw-alias-label-primary) 14%,transparent);",
      "--asd-line-strong:color-mix(in srgb,var(--dsw-alias-label-primary) 24%,transparent);}",
      ".asd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}",
      ".asd-title{margin:0;font-size:14px;font-weight:600;letter-spacing:.01em;}",
      ".asd-sub{margin:2px 0 0;font-size:11px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-legend{font-size:10px;line-height:1.5;color:var(--dsw-alias-label-tertiary);border-radius:6px;padding:5px 8px;",
      "background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);}",
      ".asd-legend b{color:var(--dsw-alias-label-secondary);font-weight:600;}",
      ".asd-legendNote{display:block;margin-top:2px;opacity:.85;}",
      ".asd-model{display:inline-flex;align-items:center;gap:4px;margin:4px 0 0;padding:0;border:0;background:none;",
      "font-size:10px;line-height:1.4;color:var(--dsw-alias-label-tertiary);cursor:pointer;opacity:.9;}",
      ".asd-model:hover{color:var(--dsw-alias-label-secondary);}",
      ".asd-model b{font-weight:600;color:var(--dsw-alias-label-secondary);}",
      ".asd-modelWrap{position:relative;display:block;}",
      ".asd-model[data-picked=true] b{color:var(--dsw-alias-state-business-primary);}",
      ".asd-modelTag{margin-left:4px;padding:0 4px;border-radius:4px;font-style:normal;font-size:9px;",
      "background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);",
      "color:var(--dsw-alias-state-business-primary);}",
      ".asd-modelArrow{font-style:normal;font-size:8px;opacity:.55;margin-left:2px;}",
      ".asd-pick{position:absolute;left:0;top:100%;z-index:20;margin-top:4px;width:min(280px,78vw);",
      "padding:6px;border:1px solid var(--asd-line-strong);border-radius:8px;",
      "background:var(--dsw-alias-bg-layer-2);box-shadow:0 8px 24px rgba(0,0,0,.18);",
      "max-height:320px;overflow:auto;}",
      ".asd-pickHead{font-size:10px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:0 2px 2px;}",
      ".asd-pickHint{font-size:10px;line-height:1.5;color:var(--dsw-alias-label-tertiary);margin:0 2px 6px;}",
      ".asd-pickGroup{margin-top:6px;}",
      ".asd-pickProvider{font-size:10px;color:var(--dsw-alias-label-tertiary);margin:0 2px 3px;}",
      ".asd-pickRow{display:flex;align-items:center;gap:6px;width:100%;padding:4px 6px;border:0;",
      "border-radius:6px;background:none;color:var(--dsw-alias-label-primary);font:inherit;",
      "font-size:11px;text-align:left;cursor:pointer;}",
      ".asd-pickRow:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);}",
      ".asd-pickRow[data-on=true]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent);}",
      ".asd-pickName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".asd-pickTag{flex:0 0 auto;font-size:9px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-pickBadge{flex:0 0 auto;padding:0 4px;border-radius:4px;font-size:9px;",
      "background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);",
      "color:var(--dsw-alias-state-business-primary);}",
      ".asd-pickEmpty{font-size:10px;color:var(--dsw-alias-label-tertiary);padding:4px 2px;}",
      ".asd-headBtn{flex:0 0 auto;height:26px;padding:0 10px;border-radius:10px;cursor:pointer;",
      "border:1px solid var(--asd-line-strong);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;}",
      ".asd-headBtn:hover{background:var(--asd-surface-2);border-color:var(--dsw-alias-label-tertiary);}",
      ".asd-input{width:100%;box-sizing:border-box;min-height:96px;max-height:34vh;resize:vertical;padding:10px;border-radius:12px;",
      "border:1px solid var(--asd-line-strong);background:var(--asd-surface-2);color:var(--dsw-alias-label-primary);",
      "font:inherit;line-height:1.65;outline:none;}",
      ".asd-input:focus{border-color:var(--dsw-alias-state-business-primary);}",
      ".asd-modeRow{display:flex;align-items:center;gap:8px;}",
      ".asd-modeLabel{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-segSm{flex:0 0 auto;padding:2px;}",
      ".asd-segSm .asd-segBtn{flex:0 0 auto;height:22px;padding:0 10px;font-size:11px;}",
      ".asd-meta{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--dsw-alias-label-tertiary);",
      "font-variant-numeric:tabular-nums;}",
      ".asd-score{display:flex;align-items:center;gap:14px;padding:12px;border-radius:14px;",
      "border:1px solid var(--asd-line-strong);background:var(--asd-surface-2);}",
      ".asd-ringWrap{position:relative;flex:0 0 auto;width:84px;height:84px;}",
      ".asd-ring{display:block;}",
      ".asd-ringTrack{fill:none;stroke:var(--asd-line-strong);stroke-width:7;}",
      ".asd-ringValue{fill:none;stroke:var(--dsw-alias-state-success-primary);stroke-width:7;stroke-linecap:round;",
      "transition:stroke-dashoffset .28s ease,stroke .28s ease;}",
      ".asd-ringValue[data-tone=mid]{stroke:var(--dsw-alias-state-warn-primary);}",
      ".asd-ringValue[data-tone=high]{stroke:var(--dsw-alias-state-error-primary);}",
      ".asd-ringText{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;}",
      ".asd-ringNum{font-size:22px;font-weight:650;line-height:1;font-variant-numeric:tabular-nums;}",
      ".asd-ringUnit{font-size:10px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-verdict{display:flex;flex-direction:column;gap:3px;min-width:0;}",
      ".asd-verdictTop{font-size:13px;font-weight:600;}",
      ".asd-verdictTop[data-tone=mid]{color:var(--dsw-alias-state-warn-primary);}",
      ".asd-verdictTop[data-tone=high]{color:var(--dsw-alias-state-error-primary);}",
      ".asd-verdictTop[data-tone=low]{color:var(--dsw-alias-state-success-primary);}",
      ".asd-verdictSub{font-size:11px;color:var(--dsw-alias-label-secondary);}",
      ".asd-dims{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;}",
      ".asd-dim{padding:8px 10px;border-radius:12px;border:1px solid var(--asd-line);",
      "background:var(--asd-surface);display:flex;flex-direction:column;gap:5px;}",
      ".asd-dimTop{display:flex;align-items:baseline;justify-content:space-between;gap:6px;}",
      ".asd-dimName{display:inline-flex;align-items:center;gap:5px;min-width:0;}",
      ".asd-dimLabel{font-size:11px;color:var(--dsw-alias-label-secondary);}",
      ".asd-dimHits{flex:0 0 auto;font-size:9px;line-height:14px;padding:0 5px;border-radius:999px;",
      "background:var(--asd-surface-2);color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}",
      ".asd-dim[data-click=true]{text-align:left;font:inherit;color:inherit;cursor:pointer;}",
      ".asd-dim[data-click=true]:hover{border-color:var(--dsw-alias-label-tertiary);}",
      ".asd-dim[data-click=true]:hover .asd-dimHits{color:var(--dsw-alias-label-secondary);}",
      ".asd-dim[data-click=true]:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}",
      ".asd-dimScore{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;}",
      ".asd-dimBar{height:4px;border-radius:999px;background:var(--asd-line);overflow:hidden;}",
      ".asd-dimBar>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-success-primary);",
      "transition:width .28s ease;}",
      ".asd-dim[data-tone=mid] .asd-dimBar>i{background:var(--dsw-alias-state-warn-primary);}",
      ".asd-dim[data-tone=high] .asd-dimBar>i{background:var(--dsw-alias-state-error-primary);}",
      ".asd-dimHint{font-size:10px;color:var(--dsw-alias-label-tertiary);}",
      // 七个页签在窄侧栏里一行排不下：允许换行，否则整排撑出面板
      ".asd-seg{display:flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:10px;",
      "background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);}",
      ".asd-segBtn{flex:1 1 auto;height:26px;padding:0 8px;border:0;border-radius:8px;cursor:pointer;background:transparent;",
      "color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;}",
      ".asd-segBtn[data-on=true]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);",
      "box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent),",
      "0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);font-weight:600;}",
      ".asd-annot{white-space:pre-wrap;word-break:break-word;padding:10px;border-radius:12px;",
      "border:1px solid var(--asd-line);background:var(--asd-surface);",
      "max-height:38vh;overflow-y:auto;line-height:1.85;flex:0 0 auto;min-height:72px;}",
      ".asd-annotWrap{display:flex;flex-direction:column;gap:6px;flex:0 0 auto;}",
      // 从句长节奏 / 段落热力跳过来的目标区间：整行浅色底 + 左侧竖条
      ".asd-annot [data-focus=true]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent);",
      "box-shadow:-2px 0 0 0 var(--dsw-alias-state-business-primary);}",
      ".asd-keys{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:0 2px;",
      "font-size:10px;line-height:1.4;color:var(--dsw-alias-label-tertiary);}",
      ".asd-keysTitle{font-weight:600;color:var(--dsw-alias-label-secondary);}",
      ".asd-key{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;",
      "background:none;border:0;padding:1px 5px;margin:0;border-radius:6px;font:inherit;color:inherit;",
      "line-height:1.4;cursor:pointer;transition:background .12s ease,color .12s ease;}",
      ".asd-key:hover{background:var(--asd-surface-2);color:var(--dsw-alias-label-secondary);}",
      ".asd-key:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}",
      ".asd-key[data-zero=true]{opacity:.42;cursor:default;}",
      ".asd-key[data-zero=true]:hover{background:none;}",
      ".asd-key[data-active=true]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 20%,transparent);",
      "color:var(--dsw-alias-label-primary);font-weight:600;}",
      ".asd-keyDot{width:12px;height:12px;border-radius:3px;flex:0 0 auto;",
      "background:currentColor;color:var(--dsw-alias-label-primary);}",
      ".asd-keyDot[data-dim=cliche]{color:var(--dsw-alias-state-error-primary);}",
      ".asd-keyDot[data-dim=connective]{color:var(--dsw-alias-state-warn-primary);}",
      ".asd-keyDot[data-dim=uniformity]{color:var(--dsw-alias-state-business-primary);}",
      ".asd-keyDot[data-dim=parallel]{color:var(--asd-c-parallel);}",
      ".asd-keyDot[data-dim=diversity]{color:var(--dsw-alias-label-primary);}",
      ".asd-keyDot[data-dim=semantic]{color:var(--asd-c-semantic);}",
      ".asd-keyDot[data-dim=detail]{color:var(--dsw-alias-label-tertiary);}",
      ".asd-hl{border-radius:3px;padding:0 1px;cursor:pointer;background:transparent;",
      "border-bottom:2px solid currentColor;color:inherit;}",
      ".asd-hl[data-dim=detail]{color:var(--dsw-alias-label-secondary);border-bottom-style:dashed;}",
      ".asd-hl[data-soft=true]{background:none;border-bottom-style:dashed;}",
      ".asd-hl[data-dim=cliche]{color:var(--dsw-alias-state-error-primary);",
      "background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);}",
      ".asd-hl[data-dim=connective]{color:var(--dsw-alias-state-warn-primary);",
      "background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);}",
      ".asd-hl[data-dim=uniformity]{color:var(--dsw-alias-state-business-primary);",
      "background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);}",
      ".asd-hl[data-dim=parallel]{color:var(--asd-c-parallel);",
      "background:color-mix(in srgb,var(--asd-c-parallel) 12%,transparent);}",
      ".asd-hl[data-dim=diversity]{color:var(--dsw-alias-label-primary);",
      "background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);}",
      ".asd-hl[data-active=true]{outline:2px solid var(--dsw-alias-label-primary);outline-offset:1px;}",
      ".asd-empty{padding:14px;border-radius:12px;border:1px dashed var(--asd-line-strong);",
      "color:var(--dsw-alias-label-tertiary);font-size:12px;text-align:center;}",
      ".asd-list{display:flex;flex-direction:column;gap:8px;}",
      ".asd-card{padding:10px;border-radius:12px;border:1px solid var(--asd-line);",
      "background:var(--asd-surface);display:flex;flex-direction:column;gap:6px;}",
      ".asd-card[data-active=true]{border-color:var(--dsw-alias-state-business-primary);}",
      ".asd-card[data-off=true]{opacity:.5;}",
      ".asd-cardTop{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;}",
      ".asd-tag{flex:0 0 auto;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:500;",
      "background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);}",
      ".asd-quote{font-size:11px;color:var(--dsw-alias-label-tertiary);word-break:break-all;}",
      ".asd-advice{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6;}",
      ".asd-cmpRow[data-jump=true]:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);}",
    ".asd-cmpRow[data-jump=true]:hover .asd-cmpGo{opacity:1;}",
    ".asd-cmpRow[data-jump=true]:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}",
    ".asd-cmpGo{font-style:normal;font-size:9px;margin-left:3px;opacity:.45;color:var(--dsw-alias-state-business-primary);}",
    ".asd-cmp{display:flex;flex-direction:column;gap:4px;padding:6px 8px;border-radius:8px;",
      "background:var(--asd-surface-2);border:1px solid var(--asd-line);}",
      ".asd-cmpRow{display:flex;gap:6px;align-items:baseline;font-size:11px;line-height:1.6;}",
      ".asd-cmpTag{flex:0 0 auto;min-width:28px;font-size:10px;font-weight:600;color:var(--dsw-alias-label-tertiary);}",
      ".asd-cmpTag[data-kind=after]{color:var(--dsw-alias-state-business-primary);}",
      ".asd-cmpText{flex:1 1 auto;word-break:break-all;color:var(--dsw-alias-label-secondary);}",
      ".asd-cmpHit{background:transparent;color:var(--dsw-alias-state-error-primary);text-decoration:line-through;",
      "text-decoration-thickness:1px;text-underline-offset:2px;}",
      ".asd-cmpSoft{background:transparent;color:var(--dsw-alias-label-primary);border-bottom:1px dashed var(--dsw-alias-label-tertiary);}",
      ".asd-cmpMuted{color:var(--dsw-alias-label-tertiary);font-style:italic;}",
    ".asd-cmpRow[data-jump=true]{cursor:pointer;margin:-2px -4px;padding:2px 4px;border-radius:6px;}",
      ".asd-topRank{font-size:11px;font-weight:700;color:var(--dsw-alias-label-tertiary);}",
      ".asd-topDelta{font-size:11px;font-weight:700;color:var(--dsw-alias-state-success-primary);}",
      ".asd-topDims{font-size:10px;color:var(--dsw-alias-label-tertiary);margin-left:auto;}",
      ".asd-cmpBox{display:flex;flex-direction:column;gap:6px;}",
      ".asd-cmpHead{display:flex;justify-content:space-between;font-size:11px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-cmpHead b{color:var(--dsw-alias-label-primary);}",
      ".asd-inputSm{min-height:76px;}",
      ".asd-cmpSum{display:flex;align-items:center;gap:8px;font-size:20px;font-weight:700;}",
      ".asd-cmpNum[data-tone=high]{color:var(--dsw-alias-state-error-primary);}",
      ".asd-cmpNum[data-tone=mid]{color:var(--dsw-alias-state-warn-primary);}",
      ".asd-cmpNum[data-tone=low]{color:var(--dsw-alias-state-success-primary);}",
      ".asd-cmpArrow{font-size:14px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-cmpDelta{font-size:12px;font-weight:600;color:var(--dsw-alias-state-error-primary);}",
      ".asd-cmpDelta[data-down=true]{color:var(--dsw-alias-state-success-primary);}",
      ".asd-cmpStats{display:flex;gap:12px;font-size:11px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-cmpLine{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary);}",
      ".asd-cmpLine b{color:var(--dsw-alias-label-primary);}",
      ".asd-drop{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border-radius:12px;",
      "border:1px dashed var(--asd-line-strong);}",
      ".asd-dropText{font-size:11px;color:var(--dsw-alias-label-tertiary);text-align:center;}",
      ".asd-fileBtn{display:inline-flex;align-items:center;}",
      ".asd-trend{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:10px;",
      "background:var(--asd-surface-2);font-size:11px;}",
      ".asd-trendHead{display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--dsw-alias-label-secondary);}",
      ".asd-trendDelta{font-weight:600;color:var(--dsw-alias-state-error-primary);}",
      ".asd-trendDelta[data-down=true]{color:var(--dsw-alias-state-success-primary);}",
      ".asd-trendMin{color:var(--dsw-alias-label-tertiary);}",
      ".asd-trendBars{display:flex;align-items:flex-end;gap:2px;height:52px;overflow:hidden;}",
      ".asd-trendBar{flex:1 1 0;min-width:2px;max-width:22px;border-radius:2px 2px 0 0;",
      "background:currentColor;color:var(--dsw-alias-state-success-primary);}",
      ".asd-trendBar[data-tone=mid]{color:var(--dsw-alias-state-warn-primary);}",
      ".asd-trendBar[data-tone=high]{color:var(--dsw-alias-state-error-primary);}",
      ".asd-trendBar[data-tone=low]{color:var(--dsw-alias-label-tertiary);}",
      ".asd-tdDelta{font-style:normal;font-size:9px;margin-left:3px;}",
      ".asd-tdDelta[data-down=true]{color:var(--dsw-alias-state-success-primary);}",
      ".asd-tdDelta[data-down=false]{color:var(--dsw-alias-state-error-primary);}",
      ".asd-table{display:flex;flex-direction:column;gap:2px;font-size:11px;}",
      ".asd-tr{display:grid;grid-template-columns:1fr 44px 44px 1.4fr;gap:6px;align-items:center;",
      "padding:5px 6px;border-radius:8px;}",
      ".asd-tr:nth-child(even){background:var(--asd-surface-2);}",
      ".asd-th{font-weight:600;color:var(--dsw-alias-label-tertiary);}",
      ".asd-tdTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".asd-tdScore{font-weight:700;}",
      ".asd-tdScore[data-tone=high]{color:var(--dsw-alias-state-error-primary);}",
      ".asd-tdScore[data-tone=mid]{color:var(--dsw-alias-state-warn-primary);}",
      ".asd-tdScore[data-tone=low]{color:var(--dsw-alias-state-success-primary);}",
      ".asd-tdTop{color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".asd-target{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:11px;",
      "color:var(--dsw-alias-label-tertiary);}",
      ".asd-presets{flex:0 0 auto;gap:3px;}",
      ".asd-headBtns{display:flex;gap:6px;flex:0 0 auto;}",
      ".asd-metaBtn{height:20px;padding:0 8px;font-size:10px;margin-left:auto;}",
      ".asd-marksBar{display:flex;align-items:center;gap:4px;font-size:10px;",
      "color:var(--dsw-alias-label-tertiary);}",
      ".asd-fsBtn{flex:0 0 auto;height:20px;min-width:26px;padding:0 6px;border-radius:6px;cursor:pointer;",
      "border:1px solid var(--asd-line);background:var(--asd-surface);color:var(--dsw-alias-label-secondary);",
      "font:inherit;line-height:1;}",
      ".asd-fsBtn:hover:not(:disabled){background:var(--asd-surface-2);color:var(--dsw-alias-label-primary);}",
      ".asd-fsBtn:disabled{opacity:.4;cursor:default;}",
      ".asd-tr[data-click=true]{cursor:pointer;}",
      ".asd-tr[data-click=true]:hover{background:var(--asd-surface-2);}",
      ".asd-big{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;gap:10px;",
      "padding:16px;box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);",
      "box-shadow:0 0 0 1px var(--asd-line-strong);}",
      ".asd-bigBar{display:flex;align-items:center;gap:10px;}",
      ".asd-bigTitle{font-size:13px;font-weight:600;}",
      ".asd-bigHint{flex:1 1 auto;font-size:11px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-bigInput{flex:1 1 auto;min-height:0;max-height:none;font-size:14px;line-height:1.7;}",
      ".asd-target input{width:44px;height:22px;border-radius:8px;text-align:center;font-size:11px;",
      "border:1px solid var(--asd-line-strong);background:transparent;color:var(--dsw-alias-label-primary);}",
      ".asd-hit{font-size:11px;font-weight:600;color:var(--dsw-alias-state-success-primary);}",
      ".asd-hit[data-miss=true]{color:var(--dsw-alias-label-tertiary);}",
      ".asd-rhythm{display:flex;align-items:flex-end;gap:1px;height:44px;padding:4px 0;",
      "overflow:hidden;}",
      ".asd-rhythmBar{flex:1 1 0;min-width:1px;max-width:18px;border-radius:2px 2px 0 0;",
      "background:var(--dsw-alias-state-business-primary);opacity:.75;cursor:pointer;}",
      ".asd-rhythmBar:hover{opacity:1;}",
      ".asd-rhythmBar[data-long=true]{background:var(--dsw-alias-state-warn-primary);}",
      ".asd-heat{display:flex;flex-wrap:wrap;gap:3px;}",
      ".asd-heatCell{width:14px;height:14px;border-radius:3px;background:var(--asd-surface-2);",
      "cursor:pointer;}",
      ".asd-heatCell:hover{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:1px;}",
      ".asd-ignored{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;",
      "color:var(--dsw-alias-label-tertiary);}",
      ".asd-ignoredTag{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:8px;",
      "background:var(--asd-surface-2);}",
      ".asd-cfg{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px;}",
      ".asd-cfgBtns{display:flex;gap:4px;}",
      ".asd-cfgText{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:1.4;height:52px;}",
      ".asd-optBox{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:10px;",
      "background:var(--asd-surface-2);font-size:11px;}",
      ".asd-optRow{display:flex;align-items:center;gap:6px;}",
      ".asd-optLabel{flex:0 0 46px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-optInput{flex:1 1 auto;min-height:52px;padding:5px 7px;border-radius:8px;font-size:11px;",
      "border:1px solid var(--asd-line-strong);background:transparent;color:var(--dsw-alias-label-primary);",
      "resize:vertical;font-family:inherit;}",
      ".asd-chips{display:flex;flex-wrap:wrap;gap:4px;flex:1 1 auto;}",
      ".asd-chip{flex:0 0 auto;height:20px;padding:0 8px;border-radius:10px;font-size:10px;cursor:pointer;",
      "border:1px solid var(--asd-line-strong);background:transparent;color:var(--dsw-alias-label-secondary);}",
      ".asd-chip:hover{border-color:var(--dsw-alias-label-tertiary);}",
      ".asd-chip[data-on=true]{border-color:var(--dsw-alias-state-error-primary);",
      "color:var(--dsw-alias-state-error-primary);text-decoration:line-through;}",
      ".asd-cardFoot{display:flex;gap:6px;}",
      ".asd-btn{height:26px;padding:0 10px;border-radius:10px;cursor:pointer;font-size:12px;",
      "border:1px solid var(--asd-line-strong);background:transparent;color:var(--dsw-alias-label-primary);}",
      ".asd-btn:hover{background:var(--asd-surface-2);border-color:var(--dsw-alias-label-tertiary);}",
      ".asd-btn[data-primary=true]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);",
      "color:var(--dsw-alias-label-primary-inverted);font-weight:600;}",
      ".asd-tip{padding:8px 10px;border-radius:10px;font-size:11px;line-height:1.6;",
      "background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent);",
      "color:var(--dsw-alias-label-secondary);}",
      ".asd-rwOut{white-space:pre-wrap;word-break:break-word;padding:10px;border-radius:12px;font-size:12px;",
      "border:1px solid var(--asd-line);background:var(--asd-surface-2);",
      "max-height:30vh;overflow-y:auto;line-height:1.7;flex:0 0 auto;min-height:64px;}",
      ".asd-row{display:flex;align-items:center;gap:8px;}",
      ".asd-rowBtns{display:flex;gap:6px;flex-wrap:wrap;}",
      ".asd-hist{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:12px;",
      "border:1px solid var(--asd-line);background:var(--asd-surface);}",
      ".asd-histTop{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
      ".asd-histScore{font-size:12px;font-weight:650;font-variant-numeric:tabular-nums;}",
      ".asd-histScore[data-tone=mid]{color:var(--dsw-alias-state-warn-primary);}",
      ".asd-histScore[data-tone=high]{color:var(--dsw-alias-state-error-primary);}",
      ".asd-histScore[data-tone=low]{color:var(--dsw-alias-state-success-primary);}",
      ".asd-histTime{font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}",
      ".asd-histText{font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all;}",
      ".asd-toast{position:sticky;bottom:0;align-self:center;padding:4px 12px;border-radius:999px;font-size:11px;",
      "background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted);}",
      ".asd-hl[data-dim=semantic]{color:var(--asd-c-semantic);",
      "background:color-mix(in srgb,var(--asd-c-semantic) 20%,transparent);}",
      ".asd-rev{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;font-size:11px;",
      "line-height:1.5;border:1px solid var(--asd-line);background:var(--asd-surface);",
      "color:var(--dsw-alias-label-secondary);}",
      ".asd-rev[data-state=error]{border-color:var(--dsw-alias-state-error-primary);",
      "color:var(--dsw-alias-state-error-primary);}",
      ".asd-revText{flex:1 1 auto;word-break:break-word;}",
      ".asd-revDot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary);}",
      ".asd-rev[data-state=running] .asd-revDot{background:var(--dsw-alias-state-business-primary);",
      "animation:asdPulse 1s ease-in-out infinite;}",
      ".asd-rev[data-state=done] .asd-revDot{background:var(--dsw-alias-state-success-primary);}",
      ".asd-rev[data-state=error] .asd-revDot{background:var(--dsw-alias-state-error-primary);}",
      ".asd-auto{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;cursor:pointer;",
      "color:var(--dsw-alias-label-tertiary);user-select:none;}",
      ".asd-auto input{width:12px;height:12px;margin:0;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer;}",
      ".asd-btn[disabled]{opacity:.45;cursor:default;}",
      ".asd-pfRow{display:flex;flex-direction:column;gap:6px;padding:9px 10px;border-radius:12px;",
      "border:1px solid var(--asd-line);background:var(--asd-surface);}",
      ".asd-pfTop{display:flex;align-items:center;gap:5px;flex-wrap:wrap;}",
      ".asd-pfTag{flex:0 0 auto;padding:1px 6px;border-radius:6px;font-size:9px;",
      "background:var(--asd-surface-2);color:var(--dsw-alias-label-tertiary);}",
      ".asd-pfTag[data-strong=true]{color:var(--dsw-alias-state-error-primary);}",
      ".asd-pfPos{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-tertiary);",
      "font-variant-numeric:tabular-nums;}",
      ".asd-pfText{font-size:12px;line-height:1.8;word-break:break-word;",
      "color:var(--dsw-alias-label-secondary);}",
      ".asd-pfHit{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 22%,transparent);",
      "color:var(--dsw-alias-state-error-primary);border-radius:3px;padding:0 1px;}",
      ".asd-pfFix{color:var(--dsw-alias-state-success-primary);font-weight:600;}",
      ".asd-pfWhy{margin-left:6px;font-size:10px;color:var(--dsw-alias-label-tertiary);}",
      ".asd-pfSum{font-size:11px;color:var(--dsw-alias-label-tertiary);}",
      "@keyframes asdPulse{0%,100%{opacity:.3;}50%{opacity:1;}}"
    ].join("");

    /* ------------------------------------------------------------------ *
     * UI
     * ------------------------------------------------------------------ */

    function ScoreRing(props) {
      var r = 34;
      var c = 2 * Math.PI * r;
      var pct = props.valid ? clamp(props.score, 0, 100) / 100 : 0;
      return h("div", { className: "asd-ringWrap" },
        h("svg", { className: "asd-ring", viewBox: "0 0 84 84", width: 84, height: 84, "aria-hidden": "true" },
          h("circle", { cx: 42, cy: 42, r: r, className: "asd-ringTrack" }),
          h("circle", {
            cx: 42, cy: 42, r: r, className: "asd-ringValue",
            "data-tone": props.tone,
            strokeDasharray: String(c),
            strokeDashoffset: String(c * (1 - pct)),
            transform: "rotate(-90 42 42)"
          })
        ),
        h("div", { className: "asd-ringText" },
          h("span", { className: "asd-ringNum" }, props.valid ? String(props.score) : "—"),
          h("span", { className: "asd-ringUnit" }, props.valid ? "/ 100" : "字太少")
        )
      );
    }

    function DimCard(props) {
      var d = props.dim;
      var loc = props.loc || 0;
      var can = loc > 0 && typeof props.onJump === "function";
      var kids = [
        h("div", { className: "asd-dimTop" },
          h("span", { className: "asd-dimName" },
            h("span", { className: "asd-dimLabel" }, d.label),
            can ? h("span", { className: "asd-dimHits" }, loc + " 处") : null
          ),
          h("span", { className: "asd-dimScore" }, String(d.score))
        ),
        h("div", { className: "asd-dimBar" }, h("i", { style: { width: clamp(d.score, 0, 100) + "%" } })),
        d.hint ? h("div", { className: "asd-dimHint" }, d.source === "model" ? "模型 · " + d.hint : d.hint) : null
      ];
      // 能定位到正文的分项做成按钮：点一下进标注页并跳到该类第一处，再点跳下一处（与图例同一套游标）
      if (can) {
        return h("button", {
          type: "button",
          className: "asd-dim",
          "data-tone": toneOf(d.score),
          "data-click": "true",
          title: "点一下去正文里定位这一类问题（共 " + loc + " 处，可循环）",
          onClick: function () { props.onJump(d.key); }
        }, kids);
      }
      return h("div", {
        className: "asd-dim",
        "data-tone": toneOf(d.score),
        title: loc ? "" : "这一项是全文统计，没有可定位的片段"
      }, kids);
    }

    function StyleDetectorTab(props) {
      var draftState = useState(readDraft);
      var text = draftState[0];
      var setText = draftState[1];

      // 初始文本已存在时不要重复记一条历史
      var remembered = useRef(text);

      var settledState = useState(text);
      var settled = settledState[0];
      var setSettled = settledState[1];

      var viewState = useState("diagnose");
      var view = viewState[0];
      var setView = viewState[1];

      var activeState = useState(null);
      var activeId = activeState[0];
      var setActiveId = activeState[1];

      var histState = useState(readHistory);
      var history = histState[0];
      var setHistory = histState[1];

      var autoState = useState(readAuto);
      var auto = autoState[0];
      var setAuto = autoState[1];

      var modeState = useState(readMode);
      var mode = modeState[0];
      var setMode = modeState[1];
      var toastState = useState("");
      var toast = toastState[0];
      var setToast = toastState[1];

      // 模型复审：只存一次请求的结果，失败也不影响本地分数
      var reviewState = useState(null);
      var review = reviewState[0];
      var setReview = reviewState[1];

      // 当前复审会用的模型（GET 路由只回报，不发起模型调用）
      var routeState = useState(null);
      var route = routeState[0];
      var setRoute = routeState[1];
      // 自己挑的复审模型；provider 与 model 都为空表示跟随默认
      var pickState = useState(readPick);
      var pick = pickState[0];
      var setPick = pickState[1];
      var pickOpenState = useState(false);
      var pickOpen = pickOpenState[0];
      var setPickOpen = pickOpenState[1];
      // 请求发出时要知道「此刻」用的是哪个模型，用 ref 避免拿到上一次渲染的旧值
      var pickRef = useRef(null);
      if (!pickRef.current) pickRef.current = readPick();
      var toastTimer = useRef(0);
      var cardRefs = useRef({});
      var reqSeq = useRef(0);
      var lastReq = useRef("");

      var annotRef = useRef(null);
      // 图例点击的循环游标：dim -> 已经跳到第几个（-1 表示还没点过）
      var legendState = useState({ dim: "", index: -1 });
      var legend = legendState[0];
      var setLegend = legendState[1];
      // 句长节奏 / 段落热力点击后要定位的那一段原文（按字符区间）
      var focusState = useState(null);
      var focus = focusState[0];
      var setFocus = focusState[1];

      // 忽略：单条问题 + 整个分项，都记在本地，下次改文还在
      var ignoreState = useState(readIgnore);
      var ignore = ignoreState[0];
      var setIgnore = ignoreState[1];
      // 自定义词表：黑名单永远算套话，白名单永远不算
      var customState = useState(readCustom);
      var custom = customState[0];
      var setCustom = customState[1];
      // 目标分：达到就显示已达标
      var targetState = useState(readTarget);
      var target = targetState[0];
      var setTarget = targetState[1];
      var optState = useState(false);
      var showOpt = optState[0];
      var setShowOpt = optState[1];
      // 两版对比的第二版
      var v2State = useState(readV2);
      var v2Text = v2State[0];
      var setV2Text = v2State[1];
      var cmpState = useState(null);
      var cmp = cmpState[0];
      var setCmp = cmpState[1];
      // 整章批量：切好的章节 + 每章分数
      var batchState = useState(null);
      var batch = batchState[0];
      var setBatch = batchState[1];
      // 单步撤销：替换原文 / 应用单条改写之前把正文压一份进来
      var undoState = useState(null);
      var undo = undoState[0];
      var setUndo = undoState[1];
      // 放大编辑：全屏覆盖层
      var bigState = useState(false);
      var big = bigState[0];
      var setBig = bigState[1];
      // 标注页正文字号
      var fontState = useState(readFontScale);
      var fontScale = fontState[0];
      var setFontScale = fontState[1];
      // 面板根节点：切页签时回到顶部
      var rootRef = useRef(null);
      // 配置备份：导入导出用的文本框（换机器、重装时不用一项项重配）
      var cfgState = useState("");
      var cfgText = cfgState[0];
      var setCfgText = cfgState[1];
      // 错字校对：模型那一路的结果只对发起时的那段文本有效，与 AI 味完全分开
      var proofState = useState(null);
      var proof = proofState[0];
      var setProof = proofState[1];
      var proofSeq = useRef(0);
      useEffect(function () {
        var id = window.setTimeout(function () { setSettled(text); }, 180);
        return function () { window.clearTimeout(id); };
      }, [text]);

      useEffect(function () { saveDraft(text); }, [text]);

      // 文本一变，旧的复审结论就作废，否则高亮和片段会对不上
      useEffect(function () {
        reqSeq.current++; // 作废在飞的请求，别让旧结果盖到新文本上
        lastReq.current = ""; // 文本变了就允许自动复审再跑一次
        setReview(function (prev) { return prev ? null : prev; });
        setProof(function (prev) { return prev ? null : prev; });
      }, [text]);

      // 文本一变，图例的循环游标也归零（否则会指到已经不存在的第 N 个问题）
      useEffect(function () {
        setLegend({ dim: "", index: -1 });
        setFocus(null); // 文本变了，旧的定位区间已经对不上了
      }, [text]);

      useEffect(function () {
        return function () {
          if (toastTimer.current) window.clearTimeout(toastTimer.current);
        };
      }, []);

      // 忽略表与自定义词表一起构成打分口径；用 memo 固定引用，避免每次渲染都重算全部分析
      var opts = useMemo(function () {
        return { ignore: ignore, custom: custom };
      }, [ignore, custom]);

      var baseAnalysis = useMemo(function () { return analyze(settled, mode, opts); }, [settled, mode, opts]);
      // 复审结果只对「发起时的那段文本 + 那个文体模式」有效，合并进同一份分析，不另开一套
      var analysis = useMemo(function () {
        if (!review || review.status !== "done" || !review.data) return baseAnalysis;
        if (review.text !== settled || (review.mode || DEFAULT_MODE) !== mode) return baseAnalysis;
        return mergeReview(baseAnalysis, review.data, settled, mode, opts);
      }, [baseAnalysis, review, settled, mode, opts]);

      // 错字：本地固定表立刻算；模型那一路要等用户点「模型校对」
      var allowWords = useMemo(function () { return allowSet(custom); }, [custom]);
      var typoList = useMemo(function () {
        var local = localTypos(settled, allowWords);
        if (!proof || proof.status !== "done" || !proof.data || proof.text !== settled) return local;
        return mergeProof(settled, local, proof.data.items, allowWords);
      }, [settled, allowWords, proof]);

      // 建议卡片要显示「原句」，按标点切句只算一次
      var sents = useMemo(function () { return splitSentences(settled); }, [settled]);

      // 最该先改的十句：每句真改一遍、重算分数，按实际掉分排序
      var topList = useMemo(function () {
        if (!analysis.valid) return [];
        return topFixes(settled, analysis, mode, opts);
      }, [settled, analysis, mode, opts]);

      // 段落热力：每段单独打一次分（轻量，不拼分段）
      var heat = useMemo(function () {
        if (!analysis.valid) return [];
        return paraHeat(settled, mode, opts);
      }, [settled, analysis.valid, mode, opts]);

      // 两版对比：第一版就是当前正文，第二版是另一个框里贴的
      var cmpResult = useMemo(function () {
        if (!v2Text || v2Text.trim().length < MIN_CHARS) return null;
        var a = analyze(settled, mode, opts);
        var b = analyze(v2Text, mode, opts);
        if (!a.valid || !b.valid) return null;
        return compareVersions(a, b);
      }, [settled, v2Text, mode, opts]);

      // 句长节奏：每根柱子一句，超过均句长 1.6 倍的标黄
      var rhythm = useMemo(function () {
        // 句子一多（整章几千字就是上百句），一根柱子至少要有 1px + 间距，
        // 否则整排会撑出卡片外。所以超过上限就按组归并，取组内最长的那句当柱高。
        var MAX_BARS = 64;
        var lens = [];
        var max = 1;
        for (var ri = 0; ri < sents.length; ri++) {
          var ln = charCount(sents[ri].text);
          if (ln > max) max = ln;
          lens.push(ln);
        }
        if (!lens.length) return [];
        var group = Math.ceil(lens.length / MAX_BARS);
        var out = [];
        for (var gi = 0; gi < lens.length; gi += group) {
          var end = Math.min(gi + group, lens.length);
          var top = 0;
          for (var gj = gi; gj < end; gj++) if (lens[gj] > top) top = lens[gj];
          out.push({ ln: top, from: gi + 1, to: end, grouped: group > 1 });
        }
        for (var rj = 0; rj < out.length; rj++) {
          out[rj].pct = Math.max(6, Math.round((out[rj].ln / max) * 100));
        }
        return out;
      }, [sents]);

      // 已忽略的指纹列表（可逐条恢复）
      var ignoredList = useMemo(function () {
        var out = [];
        for (var k in ignore.items) if (ignore.items[k]) out.push(k);
        return out;
      }, [ignore]);

      // 整章批量：每章只算分数，不拼分段与改写
      var batchRows = useMemo(function () {
        if (!batch || !batch.length) return [];
        var rows = [];
        // 上一章的分：算「较上章」用。只看有分的章，跳过的章不打断比较。
        var prevScore = null;
        for (var i = 0; i < batch.length; i++) {
          var a = analyze(batch[i].text, mode, opts, true);
          var tops = a.dims.slice().sort(function (x, y) { return y.score - x.score; });
          var sc = a.valid ? a.score : null;
          rows.push({
            key: i,
            title: batch[i].title,
            chars: a.chars,
            score: sc,
            delta: sc != null && prevScore != null ? sc - prevScore : null,
            top: a.valid ? tops.slice(0, 3) : [],
            text: batch[i].text
          });
          if (sc != null) prevScore = sc;
        }
        return rows;
      }, [batch, mode, opts]);

      // 整章批量的总览：平均分、首末变化、最好/最差章
      var batchStats = useMemo(function () {
        var scored = batchRows.filter(function (r) { return r.score != null; });
        if (!scored.length) return null;
        var sum = 0, hi = scored[0], lo = scored[0];
        for (var i = 0; i < scored.length; i++) {
          sum += scored[i].score;
          if (scored[i].score > hi.score) hi = scored[i];
          if (scored[i].score < lo.score) lo = scored[i];
        }
        return {
          n: scored.length,
          avg: Math.round(sum / scored.length),
          hi: hi,
          lo: lo,
          delta: scored[scored.length - 1].score - scored[0].score
        };
      }, [batchRows]);

      var flash = function (msg) {
        setToast(msg);
        if (toastTimer.current) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(function () { setToast(""); }, 1800);
      };

      var runReview = function () {
        if (settled.trim().length < MIN_CHARS) { flash("文本太短，无法复审"); return; }
        var at = settled;
        var md = mode;
        lastReq.current = at;
        var seq = ++reqSeq.current;
        setReview({ status: "running", data: null, error: "", text: at, mode: md });
        var pk = pickRef.current || { provider: "", model: "" };
        var payload = { text: at, mode: md };
        if (pk.provider && pk.model) { payload.provider = pk.provider; payload.model = pk.model; }
        fetch(REVIEW_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (res) {
          return res.json().then(
            function (data) { return { status: res.status, data: data }; },
            function () { return { status: res.status, data: null }; }
          );
        }).then(function (r) {
          if (seq !== reqSeq.current) return; // 已有更新的请求，旧结果直接丢
          if (!r.data || r.data.ok !== true) {
            setReview({ status: "error", data: null, error: (r.data && r.data.error) || ("复审失败（HTTP " + r.status + "）"), text: at, mode: md });
            return;
          }
          setReview({ status: "done", data: r.data, error: "", text: at, mode: md });
          // 复审回来的 provider/model 就是实际用过的，顺手刷新那行小字
          if (r.data.provider || r.data.model) {
            setRoute({ provider: r.data.provider || "", model: r.data.model || "", error: "" });
          }
        }).catch(function (e) {
          if (seq !== reqSeq.current) return;
          setReview({ status: "error", data: null, error: "调用模型失败：" + (e && e.message ? e.message : "网络错误"), text: at, mode: md });
        });
      };

      // 读当前复审模型：只发 GET，不调模型、不计费；切模型后点一下小字即可刷新
      var loadRoute = function () {
        var seq = reqSeq.current;
        fetch(REVIEW_ROUTE, { method: "GET" }).then(function (res) {
          return res.json().then(
            function (data) { return data; },
            function () { return null; }
          );
        }).then(function (data) {
          if (seq !== reqSeq.current) return; // 期间发过复审，忽略这次快照
          if (!data || data.ok !== true) {
            setRoute({ provider: "", model: "", error: (data && data.error) || "路由不可用" });
            return;
          }
          setRoute({
            provider: data.provider || "",
            model: data.model || "",
            source: data.source || "default",
            options: Array.isArray(data.options) ? data.options : [],
            error: ""
          });
        }).catch(function (e) {
          if (seq !== reqSeq.current) return;
          setRoute({ provider: "", model: "", error: e && e.message ? e.message : "网络错误" });
        });
      };

      useEffect(function () { loadRoute(); }, []);

      // 挑模型：只改本插件的复审，不动设置里的默认模型
      var chooseModel = function (provider, model) {
        var next = { provider: provider || "", model: model || "" };
        pickRef.current = next;
        setPick(next);
        setPickOpen(false);
        flash(next.provider ? "复审改用 " + next.model : "复审改回跟随默认");
      };

      var pickInited = useRef(false);
      useEffect(function () {
        pickRef.current = pick;
        savePick(pick);
        if (!pickInited.current) { pickInited.current = true; return; }
        // 换了模型，旧结论作废；正文够长就立刻按新模型再跑一次
        reqSeq.current++;
        lastReq.current = "";
        setReview(function (prev) { return prev ? null : prev; });
        if (settled.trim().length >= MIN_CHARS) runReview();
      }, [pick]);

      var pickedOn = !!(pick.provider && pick.model);
      var effModel = pickedOn ? pick.model : (route && route.model) || "";
      // 模型选择器：数据全来自宿主 llm 的 provider/model 目录，不自己维护名单
      var rowForModel = function (gid, m) {
        var on = pick.provider === gid && pick.model === m.id;
        return h("button", {
          key: gid + "/" + m.id,
          type: "button",
          className: "asd-pickRow",
          "data-on": String(on),
          title: gid + " / " + m.id,
          onClick: function () { chooseModel(gid, m.id); }
        },
          h("span", { className: "asd-pickName" }, m.name || m.id),
          m.badge ? h("span", { className: "asd-pickBadge" }, m.badge) : null,
          h("span", { className: "asd-pickTag" }, m.id === m.name ? "" : m.id)
        );
      };
      var pickerView = null;
      if (pickOpen) {
        var groups = (route && route.options) || [];
        var rows = [
          h("button", {
            key: "__default",
            type: "button",
            className: "asd-pickRow",
            "data-on": String(!pickedOn),
            title: "用设置里的默认模型（与本对话选的模型一致）",
            onClick: function () { chooseModel("", ""); }
          },
            h("span", { className: "asd-pickName" }, "跟随默认"),
            h("span", { className: "asd-pickTag" }, route && route.model ? route.model : "—")
          )
        ];
        for (var gi = 0; gi < groups.length; gi++) {
          var g = groups[gi];
          // 有些 provider 的模型 id 是一串看不见的字符，选了也调不通，直接不列出来
          var gModels = (g.models || []).filter(function (m) {
            return m && typeof m.id === "string"
              && m.id.replace(/[\s\u200b-\u200f\u2060\ufeff]/g, "") !== "";
          });
          rows.push(h("div", { key: "g-" + g.id, className: "asd-pickGroup" },
            h("div", { className: "asd-pickProvider" }, (g.name || g.id) + (g.error ? "（" + g.error + "）" : "")),
            gModels.length
              ? gModels.map(function (m) { return rowForModel(g.id, m); })
              : h("div", { className: "asd-pickEmpty" }, "这一家没有可选模型")
          ));
        }
        pickerView = h("div", { className: "asd-pick" },
          h("div", { className: "asd-pickHead" }, "复审用什么模型"),
          h("div", { className: "asd-pickHint" }, "只影响这个面板的复审；本对话的模型还是在输入框下面换。"),
          rows
        );
      }

      // 自动复审：停下来约 1 秒就自己调模型，用户不用再点按钮；
      // 同一段文本只自动跑一次（失败也不自动重试，避免反复烧 token）
      // 换文体模式：打分口径全变了，旧复审结论作废，并允许自动复审按新模式重跑一次
      // 首帧只是把当前模式写回存储，不能顺手把刚发出的「读模型」请求作废
      var modeInited = useRef(false);
      useEffect(function () {
        saveMode(mode);
        if (!modeInited.current) {
          modeInited.current = true;
          return;
        }
        reqSeq.current++;
        lastReq.current = "";
        setReview(function (prev) { return prev ? null : prev; });
        setLegend({ dim: "", index: -1 });
      }, [mode]);

      // 这几个开关只是存到本地，下次打开还在

      useEffect(function () { saveIgnore(ignore); }, [ignore]);
      useEffect(function () { saveCustom(custom); }, [custom]);
      useEffect(function () { saveTarget(target); }, [target]);
      useEffect(function () { saveV2(v2Text); }, [v2Text]);
      useEffect(function () { saveFontScale(fontScale); }, [fontScale]);

      // 换页签回到顶部，否则从诊断页底部切到建议页会停在半空
      useEffect(function () {
        var el = rootRef.current;
        if (el && typeof el.scrollTop === "number") el.scrollTop = 0;
      }, [view]);

      useEffect(function () {
        if (!auto) return;
        if (settled.trim().length < MIN_CHARS) return;
        if (lastReq.current === settled) return;
        var id = window.setTimeout(function () { runReview(); }, 900);
        return function () { window.clearTimeout(id); };
      }, [settled, auto, mode]);

      // 记录检测历史（同一段文本只记一次）
      useEffect(function () {
        if (!analysis.valid || !settled || settled === remembered.current) return;
        remembered.current = settled;
        var rec = { text: settled, score: analysis.score, at: Date.now() };
        setHistory(function (prev) {
          var next = [rec]
            .concat(prev.filter(function (r) { return r.text !== settled; }))
            .slice(0, HISTORY_LIMIT);
          saveHistory(next);
          return next;
        });
      }, [settled, analysis.valid, analysis.score]);

      // 选中问题片段后滚到对应建议卡片
      useEffect(function () {
        if (view !== "suggest" || !activeId) return;
        var el = cardRefs.current[activeId];
        if (!el || typeof el.scrollIntoView !== "function") return;
        try { el.scrollIntoView({ block: "nearest" }); } catch (e) { el.scrollIntoView(); }
      }, [view, activeId]);

      // 图例跳转后把命中片段滚进视野（只在标注视图里有意义）
      useEffect(function () {
        if (view !== "marks" || !activeId) return;
        var box = annotRef.current;
        if (!box || typeof box.querySelector !== "function") return;
        var el = box.querySelector('[data-active="true"]');
        if (!el || typeof el.scrollIntoView !== "function") return;
        try { el.scrollIntoView({ block: "nearest" }); } catch (e) { el.scrollIntoView(); }
      }, [view, activeId]);

      // 从句长节奏 / 段落热力跳过来后，把目标区间滚进视野
      useEffect(function () {
        if (view !== "marks" || !focus) return;
        var box = annotRef.current;
        if (!box || typeof box.querySelector !== "function") return;
        var el = box.querySelector('[data-focus="true"]');
        if (!el || typeof el.scrollIntoView !== "function") return;
        try { el.scrollIntoView({ block: "center" }); } catch (e) { el.scrollIntoView(); }
      }, [view, focus]);

      // 快捷键：Ctrl/⌘+Enter 立即复审、Esc 收起浮层、Ctrl/⌘+Z 撤销上一次改动。
      // 在输入框里按 Ctrl+Z 仍交给浏览器做文本撤销，不去抢。
      useEffect(function () {
        var onKey = function (e) {
          var mod = e.ctrlKey || e.metaKey;
          var tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : "";
          var typing = tag === "textarea" || tag === "input";
          if (mod && e.key === "Enter") {
            e.preventDefault();
            runReview();
            return;
          }
          if (mod && !typing && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
            if (undo) { e.preventDefault(); undoLast(); }
            return;
          }
          if (e.key === "Escape") {
            if (big) { e.preventDefault(); setBig(false); return; }
            if (showOpt) setShowOpt(false);
          }
        };
        // 宿主环境不一定有 addEventListener（测试桩、非浏览器），有才挂
        if (typeof window.addEventListener !== "function") return;
        window.addEventListener("keydown", onKey);
        return function () {
          if (typeof window.removeEventListener === "function") window.removeEventListener("keydown", onKey);
        };
      }, [undo, big, showOpt, settled, mode]);

      var copyText = function (value, okMsg) {
        var done = function () { flash(okMsg); };
        var fallback = function () {
          try {
            var ta = document.createElement("textarea");
            ta.value = value;
            ta.style.position = "fixed";
            ta.style.top = "-1000px";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            done();
          } catch (e) {
            flash("复制失败，请手动选择文本");
          }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).then(done, fallback);
        } else {
          fallback();
        }
      };

      var pushUndo = function (label) {
        setUndo({ text: settled, label: label });
      };

      var undoLast = function () {
        if (!undo) return;
        var back = undo.text;
        var label = undo.label;
        setText(back);
        setSettled(back);
        setUndo(null);
        flash("已撤销「" + label + "」");
      };

      var applyOne = function (issue) {
        if (!issue.edits || !issue.edits.length) return;
        pushUndo("这一处改写");
        var next = applyEdits(settled, issue.edits);
        setText(next);
        setSettled(next);
        flash("已应用 1 处改写");
      };

      var replaceAll = function () {
        pushUndo("替换原文");
        var next = analysis.rewrite.text;
        setText(next);
        setSettled(next);
        flash("已替换原文");
      };

      var clearAll = function () {
        setText("");
        setSettled("");
        setActiveId(null);
        setLegend({ dim: "", index: -1 });
        setFocus(null);
        setProof(null);
      };

      var loadRecord = function (rec) {
        setText(rec.text);
        setSettled(rec.text);
        setActiveId(null);
        setLegend({ dim: "", index: -1 });
        setView("diagnose");
        flash("已载入记录");
      };

      var dropRecord = function (at) {
        setHistory(function (prev) {
          var next = prev.filter(function (r) { return r.at !== at; });
          saveHistory(next);
          return next;
        });
      };

      var clearHistory = function () {
        setHistory(function () {
          saveHistory([]);
          return [];
        });
        flash("记录已清空");
      };

      // 批量结果点一行：把那一章载入正文，切到诊断页细看
      var loadChapter = function (row) {
        setText(row.text);
        setSettled(row.text);
        setActiveId(null);
        setLegend({ dim: "", index: -1 });
        setFocus(null);
        setView("diagnose");
        flash("已载入「" + row.title + "」");
      };

      // 对比页两个搬运按钮，省得手动复制粘贴
      var useV2 = function () {
        setV2Text(settled);
        flash("已把当前正文放进第二版");
      };

      var pullV2 = function () {
        if (!v2Text.trim()) { flash("第二版还是空的"); return; }
        pushUndo("载回第二版");
        setText(v2Text);
        setSettled(v2Text);
        flash("已把第二版载回正文");
      };

      // —— 忽略一条：记下指纹，下次改文还在 ——
      var ignoreIssue = function (it) {
        var sig = sigOf(it);
        setIgnore(function (prev) {
          var items = {};
          for (var k in prev.items) items[k] = prev.items[k];
          items[sig] = true;
          return { items: items, dims: prev.dims || {} };
        });
        if (activeId === it.id) setActiveId("");
        flash("已忽略这一条，不再计分");
      };

      var unignoreIssue = function (sig) {
        setIgnore(function (prev) {
          var items = {};
          for (var k in prev.items) if (k !== sig) items[k] = true;
          return { items: items, dims: prev.dims || {} };
        });
        flash("已恢复");
      };

      var ignoreDim = function (key) {
        setIgnore(function (prev) {
          var dims = {};
          for (var k in prev.dims) dims[k] = prev.dims[k];
          // 关掉时直接把键删掉，别在存储里留一个 false
          if (dims[key]) delete dims[key]; else dims[key] = true;
          return { items: prev.items || {}, dims: dims };
        });
      };

      var restoreIgnores = function () {
        setIgnore({ items: {}, dims: {} });
        flash("忽略已全部清除");
      };

      // —— 自定义词表 ——
      var setDeny = function (raw) {
        setCustom({ deny: parseWords(raw), allow: custom.allow });
      };
      var setAllow = function (raw) {
        setCustom({ deny: custom.deny, allow: parseWords(raw) });
      };

      // —— 配置备份：把词表、忽略表、目标分、文体、字号打成一个 JSON ——
      // 只搬「设置」，不搬正文和记录（那些跟着草稿/历史走，换机器重来更干净）。
      var exportConfig = function () {
        var pack = {
          v: CONFIG_VERSION,
          mode: mode,
          target: target,
          font: fontScale,
          ignore: ignore || EMPTY_IGNORE,
          custom: custom || EMPTY_CUSTOM
        };
        var json = JSON.stringify(pack);
        setCfgText(json);
        copyText(json, "配置已复制，粘到别处存好");
      };

      var importConfig = function () {
        var raw = (cfgText || "").trim();
        if (!raw) { flash("先把导出的配置粘到框里"); return; }
        var pack;
        try {
          pack = JSON.parse(raw);
        } catch (e) {
          flash("这不是合法的配置 JSON");
          return;
        }
        if (!pack || typeof pack !== "object") { flash("配置内容看不懂"); return; }
        var got = [];
        if (pack.mode === "general" || pack.mode === "fiction") { setMode(pack.mode); got.push("文体"); }
        if (typeof pack.target === "number" && pack.target >= 1 && pack.target <= 100) {
          setTarget(Math.round(pack.target));
          got.push("目标分");
        }
        if (typeof pack.font === "number" && pack.font >= 0 && pack.font < FONT_PX.length) {
          setFontScale(Math.round(pack.font));
          got.push("字号");
        }
        if (pack.custom && typeof pack.custom === "object") {
          setCustom({
            deny: parseWords(pack.custom.deny || []),
            allow: parseWords(pack.custom.allow || [])
          });
          got.push("词表");
        }
        if (pack.ignore && typeof pack.ignore === "object") {
          var ig = { items: {}, dims: {} };
          var srcItems = pack.ignore.items || {};
          for (var k in srcItems) {
            if (Object.prototype.hasOwnProperty.call(srcItems, k) && srcItems[k]) ig.items[k] = true;
          }
          var srcDims = pack.ignore.dims || {};
          for (var d in srcDims) {
            if (Object.prototype.hasOwnProperty.call(srcDims, d) && srcDims[d]) ig.dims[d] = true;
          }
          setIgnore(ig);
          got.push("忽略表");
        }
        flash(got.length ? "已导入：" + got.join(" · ") : "这份配置里没有可导入的设置");
      };

      // —— 错字 ——
      var addAllow = function (word) {
        if (!word) return;
        var list = (custom.allow || []).slice();
        if (list.indexOf(word) < 0) list.push(word);
        setCustom({ deny: custom.deny || [], allow: list });
        flash("已把「" + word + "」加进白名单，不再报");
      };

      var applyTypo = function (t) {
        if (!t) return;
        if (settled.slice(t.start, t.end) !== t.wrong) { flash("正文已经改过，这条校对作废了"); return; }
        pushUndo("改错字");
        var next = applyEdits(settled, [{ start: t.start, end: t.end, text: t.right }]);
        setText(next);
        setSettled(next);
        flash("已改成「" + t.right + "」");
      };

      var runProofread = function () {
        var at = settled;
        if (at.trim().length < 6) { flash("文本太短，无法校对"); return; }
        var seq = ++proofSeq.current;
        setProof({ status: "running", data: null, error: "", text: at });
        var pk = pickRef.current || { provider: "", model: "" };
        var payload = { text: at };
        if (pk.provider && pk.model) { payload.provider = pk.provider; payload.model = pk.model; }
        fetch(PROOF_ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (res) {
          return res.json().then(
            function (data) { return { status: res.status, data: data }; },
            function () { return { status: res.status, data: null }; }
          );
        }).then(function (r) {
          if (seq !== proofSeq.current) return;
          if (!r.data || r.data.ok !== true) {
            setProof({ status: "error", data: null, error: (r.data && r.data.error) || ("校对失败（HTTP " + r.status + "）"), text: at });
            return;
          }
          setProof({ status: "done", data: r.data, error: "", text: at });
        }).catch(function (e) {
          if (seq !== proofSeq.current) return;
          setProof({ status: "error", data: null, error: "调用模型失败：" + (e && e.message ? e.message : "网络错误"), text: at });
        });
      };

      // —— 整章批量：拖入或选一个 .txt ——
      var loadFile = function (file) {
        if (!file) return;
        var reader = new window.FileReader();
        reader.onload = function () {
          var txt = String(reader.result || "");
          var parts = splitChapters(txt);
          setBatch(parts);
          flash("已读入 " + parts.length + " 章");
        };
        reader.readAsText(file, "utf-8");
      };

      var verdict = analysis.valid
        ? (analysis.tone === "high" ? "AI 味偏重" : analysis.tone === "mid" ? "半人半机" : "像人写的")
        : "还不够判断";
      var verdictSub = analysis.valid
        ? (analysis.tone === "high"
          ? "套话与均匀句式偏多，按下面的建议改一轮。"
          : analysis.tone === "mid"
            ? "有机器痕迹，但还没到一眼假。"
            : "用词和句长都自然。")
        : "再输入一些文字（至少 " + MIN_CHARS + " 字）就能评分。";

      var diagnoseTips = [];
      for (var ti = 0; ti < analysis.tips.length; ti++) {
        var tipItem = analysis.tips[ti];
        var dimScore = 0;
        for (var di = 0; di < analysis.dims.length; di++) {
          if (analysis.dims[di].key === tipItem.dim) dimScore = analysis.dims[di].score;
        }
        if (dimScore >= 35) diagnoseTips.push(tipItem);
      }
      // 每个分项有多少处能在正文里定位（句子级问题现在也指向具体一句）
      var dimLoc = {};
      var liveIssues = analysis.live || analysis.issues || [];
      for (var li = 0; li < liveIssues.length; li++) {
        var locIssue = liveIssues[li];
        if (typeof locIssue.start !== "number") continue;
        dimLoc[locIssue.dim] = (dimLoc[locIssue.dim] || 0) + 1;
      }
      // 点诊断卡片：先切到标注页，再走图例那套游标
      var jumpFromCard = function (dim) {
        setView("marks");
        jumpDim(dim);
      };

      var diagnoseView = h("div", { className: "asd-list" },
        analysis.valid
          ? h("div", { className: "asd-legend" },
            "每一项都是「AI 味」分数：",
            h("b", null, "越高越像 AI"),
            "，0 = 像人写的，100 = 一眼假。总分按权重加权。",
            h("span", { className: "asd-legendNote" }, "分数低只说明没踩这些坑，不等于写得好。"))
          : null,
        h("div", { className: "asd-dims" },
          analysis.dims.map(function (d) {
            return h(DimCard, { key: d.key, dim: d, loc: dimLoc[d.key] || 0, onJump: jumpFromCard });
          })
        ),
        rhythm.length
          ? h("div", { className: "asd-card" },
            h("div", { className: "asd-cardTop" },
              h("span", { className: "asd-tag" }, "句长节奏"),
              h("span", null, "每根柱子一句；长短不齐才像人写的")
            ),
            h("div", { className: "asd-rhythm" },
              rhythm.map(function (r, ri) {
                return h("i", {
                  key: ri,
                  className: "asd-rhythmBar",
                  "data-long": String(r.ln >= 40),
                  style: { height: r.pct + "%" },
                  title: (r.grouped
                    ? "第 " + r.from + "–" + r.to + " 句 · 最长 " + r.ln + " 字"
                    : "第 " + r.from + " 句 · " + r.ln + " 字") + " · 点一下去标注页定位",
                  onClick: function () {
                    var a = sents[r.from - 1];
                    var b = sents[r.to - 1];
                    if (a && b) jumpRange(a.start, b.end);
                  }
                });
              })
            )
          )
          : null,
        heat.length
          ? h("div", { className: "asd-card" },
            h("div", { className: "asd-cardTop" },
              h("span", { className: "asd-tag" }, "段落热力"),
              h("span", null, "一个小方块一段；越红越像 AI")
            ),
            h("div", { className: "asd-heat" },
              heat.map(function (p, pi) {
                var tone = p.score == null ? "" : toneOf(p.score);
                var color = tone === "high" ? "var(--dsw-alias-state-error-primary)"
                  : tone === "mid" ? "var(--dsw-alias-state-warn-primary)"
                    : tone === "low" ? "var(--dsw-alias-state-success-primary)"
                      : "var(--asd-surface-2)";
                return h("i", {
                  key: pi,
                  className: "asd-heatCell",
                  "data-off": String(p.score == null),
                  style: p.score == null ? null : { background: color, opacity: String(0.35 + p.score / 150) },
                  title: "第 " + (pi + 1) + " 段 · " + p.chars + " 字"
                    + (p.score == null ? "（太短，不评）" : " · AI 味 " + p.score)
                    + " · 点一下去标注页定位这一段",
                  onClick: function () { jumpRange(p.start, p.end); }
                });
              })
            )
          )
          : null,
        diagnoseTips.length
          ? h("div", { className: "asd-list" },
            diagnoseTips.map(function (tip) {
              return h("div", { key: tip.dim, className: "asd-tip" }, tip.label + "：" + tip.text);
            })
          )
          : null,
        analysis.ignoredCount
          ? h("div", { className: "asd-ignored" },
            h("span", null, "已忽略 " + analysis.ignoredCount + " 处："),
            h("button", { type: "button", className: "asd-btn", onClick: restoreIgnores }, "全部恢复")
          )
          : null
      );

      // 图例固定列全 7 项，没有的标 0、变淡，这样颜色对照表总是完整可查。
      // 一段文本里一个问题都没命中时就不显示图例（没什么可对照的）。
      var KEY_ORDER = ["cliche", "connective", "uniformity", "parallel", "diversity", "detail", "semantic"];
      var KEY_LABEL = {
        cliche: "套话",
        connective: "连接词",
        uniformity: "句式均匀",
        parallel: "排比",
        diversity: "词汇重复",
        detail: "缺细节",
        semantic: "模型复审"
      };
      // 缺具体信息 / 缺画面感 的标签随文体模式变，图例跟着维度实际名字走
      var dimLabelOf = {};
      if (analysis.dims) {
        for (var dl = 0; dl < analysis.dims.length; dl++) dimLabelOf[analysis.dims[dl].key] = analysis.dims[dl].label;
      }
      var keyLabel = function (dim) { return dimLabelOf[dim] || KEY_LABEL[dim] || dim; };
      // 按问题 id 去重：一句话被切成好几段原子片段时，它仍然只算一处
      var dimCount = {}, keyTotal = 0, seenIssue = {};
      for (var ki = 0; ki < liveIssues.length; ki++) {
        var kIssue = liveIssues[ki];
        if (!kIssue || typeof kIssue.start !== "number") continue;
        if (seenIssue[kIssue.id]) continue;
        seenIssue[kIssue.id] = true;
        dimCount[kIssue.dim] = (dimCount[kIssue.dim] || 0) + 1;
        keyTotal++;
      }
      var keyList = [];
      if (keyTotal) {
        for (var ko = 0; ko < KEY_ORDER.length; ko++) {
          var kd = KEY_ORDER[ko];
          keyList.push({ dim: kd, n: dimCount[kd] || 0 });
        }
      }

      // 点图例就定位：第一次点跳本文第一个该类问题，再点跳下一个，到尾循环
      var jumpDim = function (dim) {
        var list = [];
        for (var ji = 0; ji < liveIssues.length; ji++) {
          if (liveIssues[ji].dim === dim) list.push(liveIssues[ji]);
        }
        if (!list.length) return;
        var next = (legend.dim === dim ? legend.index : -1) + 1;
        if (next >= list.length) next = 0;
        setLegend({ dim: dim, index: next });
        setActiveId(list[next].id);
        setFocus(null); // 从图例跳就不用再看图表那个定位区了
      };

      // 从图表跳回原文：把区间记下来，切到标注页，由下面的 effect 滚到那一段
      var jumpRange = function (start, end) {
        if (typeof start !== "number" || typeof end !== "number" || end <= start) return;
        setFocus({ start: start, end: end, tick: Date.now() });
        setActiveId("");
        setView("marks");
      };

      // 给每个分段算出它在原文里的字符区间，供定位高亮用
      var segSpans = useMemo(function () {
        var out = [], at = 0;
        var segs = analysis.segments || [];
        for (var i = 0; i < segs.length; i++) {
          var len = segs[i].text.length;
          out.push({ seg: segs[i], start: at, end: at + len });
          at += len;
        }
        return out;
      }, [analysis.segments]);

      // 把分段再按定位区间切一刀：这样图表点过来时，只有目标那一段被标亮，
      // 而不是整篇（没有问题时 segments 就是一整块）
      var annotPieces = useMemo(function () {
        var out = [];
        var push = function (seg, text, on, key) {
          if (text) out.push({ seg: seg, text: text, focus: on, key: key });
        };
        for (var i = 0; i < segSpans.length; i++) {
          var row = segSpans[i];
          var seg = row.seg;
          if (!focus) { push(seg, seg.text, false, i + "a"); continue; }
          var a = Math.max(row.start, focus.start);
          var b = Math.min(row.end, focus.end);
          if (b <= a) { push(seg, seg.text, false, i + "a"); continue; }
          push(seg, settled.slice(row.start, a), false, i + "a");
          push(seg, settled.slice(a, b), true, i + "b");
          push(seg, settled.slice(b, row.end), false, i + "c");
        }
        return out;
      }, [segSpans, focus, settled]);

      var annotView = analysis.valid || analysis.chars > 0
        ? h("div", { className: "asd-annotWrap" },
          h("div", { className: "asd-marksBar" },
            h("span", { className: "asd-keysTitle" }, "字号"),
            h("button", {
              type: "button", className: "asd-fsBtn",
              disabled: fontScale <= 0,
              title: "正文字号小一号",
              onClick: function () { setFontScale(clamp(fontScale - 1, 0, FONT_PX.length - 1)); }
            }, "A−"),
            h("button", {
              type: "button", className: "asd-fsBtn",
              disabled: fontScale >= FONT_PX.length - 1,
              title: "正文字号大一号",
              onClick: function () { setFontScale(clamp(fontScale + 1, 0, FONT_PX.length - 1)); }
            }, "A+")
          ),
          keyList.length
            ? h("div", { className: "asd-keys" },
              h("span", { className: "asd-keysTitle" }, "颜色"),
              keyList.map(function (k) {
                var hit = legend.dim === k.dim && !!k.n;
                var pos = hit ? " " + (legend.index + 1) + "/" + k.n : "";
                return h("button", {
                  key: k.dim,
                  type: "button",
                  className: "asd-key",
                  "data-zero": String(!k.n),
                  "data-active": String(hit),
                  disabled: !k.n,
                  title: k.n
                    ? "点一下定位到本文第一个「" + keyLabel(k.dim) + "」问题，再点跳下一个（循环）"
                    : "本文没有这一类问题",
                  onClick: function () { jumpDim(k.dim); }
                },
                  h("i", { className: "asd-keyDot", "data-dim": k.dim }),
                  keyLabel(k.dim) + " " + k.n + pos
                );
              })
            )
            : null,
          h("div", { className: "asd-annot", ref: annotRef, style: { fontSize: FONT_PX[fontScale] + "px" } },
            annotPieces.length
              ? annotPieces.map(function (pc, i) {
                var seg = pc.seg;
                var focusAttr = pc.focus ? "true" : undefined;
                if (!seg.issue) return h("span", { key: pc.key, "data-focus": focusAttr }, pc.text);
                var it = seg.issue;
                return h("mark", {
                  key: pc.key,
                  className: "asd-hl",
                  "data-dim": it.dim,
                  "data-soft": String(!!it.soft),
                  "data-active": String(it.id === activeId),
                  "data-focus": focusAttr,
                  title: it.title + " · " + it.advice,
                  onClick: function () {
                    setActiveId(it.id);
                    setView("suggest");
                  }
                }, pc.text);
              })
              : h("span", null, settled)
          )
        )
        : h("div", { className: "asd-empty" }, "先在上面粘贴一段中文文本。");
      var cardPair = function (it) {
        var box = sentenceBox(settled, sents, it.start, it.end);
        if (!box) return null;
        var from = Math.max(it.start, box.start);
        var to = Math.min(typeof it.end === "number" ? it.end : box.end, box.end);
        var parts = [];
        if (to > from) {
          if (from > box.start) parts.push({ text: settled.slice(box.start, from) });
          parts.push({ text: settled.slice(from, to), hit: true });
          if (to < box.end) parts.push({ text: settled.slice(to, box.end) });
        } else {
          parts.push({ text: settled.slice(box.start, box.end) });
        }
        var after = rewriteSentence(box, it.edits);
        return { parts: parts, after: after, same: after === box.text, box: box };
      };

      var suggestView = analysis.issues.length
        ? h("div", { className: "asd-list" },
          analysis.issues.map(function (it) {
            var pair = cardPair(it);
            var off = !!it.ignored;
            return h("div", {
              key: it.id,
              className: "asd-card",
              "data-active": String(it.id === activeId),
              "data-off": String(off),
              ref: function (el) { cardRefs.current[it.id] = el; }
            },
              h("div", { className: "asd-cardTop" },
                h("span", { className: "asd-tag" }, dimLabelOf[it.dim] || DIM_LABEL[it.dim] || it.dim),
                h("span", null, it.title)
              ),
              pair
                ? h("div", { className: "asd-cmp" },
                  h("div", {
                    className: "asd-cmpRow",
                    "data-jump": "true",
                    role: "button",
                    tabIndex: 0,
                    title: "点一下回「标注」页定位这句原文",
                    onClick: function () { if (pair.box) jumpRange(pair.box.start, pair.box.end); },
                    onKeyDown: function (ev) {
                      if (ev && (ev.key === "Enter" || ev.key === " ")) {
                        if (ev.preventDefault) ev.preventDefault();
                        if (pair.box) jumpRange(pair.box.start, pair.box.end);
                      }
                    }
                  },
                    h("span", { className: "asd-cmpTag" }, "原句", h("i", { className: "asd-cmpGo" }, "↗")),
                    h("span", { className: "asd-cmpText" },
                      pair.parts.map(function (p, pi) {
                        if (!p.hit) return h("span", { key: pi }, p.text);
                        // 整句级问题不能画成删除线（那会像是要把整句删掉），改用虚线标注
                        return h("mark", { key: pi, className: it.soft ? "asd-cmpSoft" : "asd-cmpHit" }, p.text);
                      })
                    )
                  ),
                  pair.after && !pair.same
                    ? h("div", { className: "asd-cmpRow" },
                      h("span", { className: "asd-cmpTag", "data-kind": "after" }, "改成"),
                      h("span", { className: "asd-cmpText" }, pair.after)
                    )
                    : h("div", { className: "asd-cmpRow" },
                      h("span", { className: "asd-cmpTag", "data-kind": "after" }, "改成"),
                      h("span", { className: "asd-cmpText asd-cmpMuted" }, "这条只给建议，不自动改写")
                    )
                )
                : it.snippet
                  ? h("div", { className: "asd-quote" }, "「" + it.snippet + "」")
                  : null,
              h("div", { className: "asd-advice" }, it.advice),
              h("div", { className: "asd-cardFoot" },
                it.edits && it.edits.length && !off
                  ? h("button", {
                    type: "button", className: "asd-btn",
                    onClick: function () { applyOne(it); }
                  }, "应用改写")
                  : null,
                h("button", {
                  type: "button", className: "asd-btn",
                  title: off ? "恢复这一条，重新参与打分" : "这条我确认不改，之后不再出现也不计分",
                  onClick: function () { if (off) unignoreIssue(sigOf(it)); else ignoreIssue(it); }
                }, off ? "恢复" : "忽略这条")
              )
            );
            }),
          analysis.tips.length
            ? h("div", { className: "asd-list" },
              analysis.tips.map(function (tip) {
                return h("div", { key: tip.dim, className: "asd-tip" }, tip.label + "：" + tip.text);
              })
            )
            : null,
          analysis.ignoredCount
            ? h("div", { className: "asd-ignored" },
              h("span", null, "已忽略 " + analysis.ignoredCount + " 处（不计分、不再提示）："),
              h("button", { type: "button", className: "asd-btn", onClick: restoreIgnores }, "全部恢复")
            )
            : null
        )
        : h("div", { className: "asd-empty" }, analysis.valid ? "没有发现明显问题，这段文字很像人写的。" : "文本太短，暂无可诊断项。");

      var historyView = history.length
        ? h("div", { className: "asd-list" },
          history.map(function (rec) {
            return h("div", { key: rec.at, className: "asd-hist" },
              h("div", { className: "asd-histTop" },
                h("span", { className: "asd-histScore", "data-tone": toneOf(rec.score) }, "AI 味 " + rec.score),
                h("span", { className: "asd-histTime" }, new Date(rec.at).toLocaleString())
              ),
              h("div", { className: "asd-histText" }, snippetOf(rec.text)),
              h("div", { className: "asd-rowBtns" },
                h("button", { type: "button", className: "asd-btn", onClick: function () { loadRecord(rec); } }, "载入"),
                h("button", { type: "button", className: "asd-btn", onClick: function () { dropRecord(rec.at); } }, "删除")
              )
            );
          }),
          h("div", { className: "asd-rowBtns" },
            h("button", { type: "button", className: "asd-headBtn", onClick: clearHistory }, "清空全部记录")
          )
        )
        : h("div", { className: "asd-empty" }, "还没有检测记录。每次有效检测都会自动记一条，最多保留 " + HISTORY_LIMIT + " 条。");

      // —— 重点：最该先改的十句 ——
      var topView = topList.length
        ? h("div", { className: "asd-list" },
          h("div", { className: "asd-legend" },
            "按",
            h("b", null, "真实掉分"),
            "排序：每句都真改一遍再重算总分，掉得多就排在前面。改完一轮再看一次。"),
          topList.map(function (t, i) {
            return h("div", { key: t.si + "-" + i, className: "asd-card" },
              h("div", { className: "asd-cardTop" },
                h("span", { className: "asd-topRank" }, "#" + (i + 1)),
                h("span", { className: "asd-topDelta" }, "−" + t.delta + " 分"),
                h("span", { className: "asd-topDims" }, t.dims.map(keyLabel).filter(function (x, k, arr) { return arr.indexOf(x) === k; }).join(" · "))
              ),
              h("div", { className: "asd-cmp" },
                h("div", {
                  className: "asd-cmpRow",
                  "data-jump": "true",
                  role: "button",
                  tabIndex: 0,
                  title: "点一下回「标注」页定位这句原文",
                  onClick: function () { jumpRange(t.start, t.end); },
                  onKeyDown: function (ev) {
                    if (ev && (ev.key === "Enter" || ev.key === " ")) {
                      if (ev.preventDefault) ev.preventDefault();
                      jumpRange(t.start, t.end);
                    }
                  }
                },
                  h("span", { className: "asd-cmpTag" }, "原句", h("i", { className: "asd-cmpGo" }, "↗")),
                  h("span", { className: "asd-cmpText" }, t.before)
                ),
                h("div", { className: "asd-cmpRow" },
                  h("span", { className: "asd-cmpTag", "data-kind": "after" }, "改成"),
                  h("span", { className: "asd-cmpText" }, t.after && t.after !== t.before ? t.after : "这句只能手改，工具没有安全的自动改法")
                )
              ),
              h("div", { className: "asd-rowBtns" },
                h("button", {
                  type: "button", className: "asd-btn",
                  onClick: function () {
                    var ed = collectEdits(t.issues);
                    setText(applyEdits(settled, ed));
                    flash("已应用第 " + (i + 1) + " 句的改写");
                  }
                }, "应用这句"),
                h("button", {
                  type: "button", className: "asd-btn",
                  onClick: function () {
                    setText(settled.slice(0, t.start) + settled.slice(t.end));
                    flash("已删掉这句");
                  }
                }, "删掉这句"),
                h("button", {
                  type: "button", className: "asd-btn",
                  onClick: function () {
                    var r = buildRewrite(settled, t.issues);
                    copyText(r.text, "这一句改后的文本已复制");
                  }
                }, "只复制这句")
              )
            );
          })
        )
        : h("div", { className: "asd-empty" },
          analysis.valid
            ? "这一段里没有能靠改写直接降分的句子。剩下的问题（缺细节、句式太齐）得靠加具体内容来解决。"
            : "先输入一段文字（至少 " + MIN_CHARS + " 字）。");

      // —— 对比：两版比分 ——
      var cmpView = h("div", { className: "asd-list" },
        h("div", { className: "asd-cmpBox" },
          h("div", { className: "asd-cmpHead" }, "第一版（左边正文）", h("b", null, analysis.valid ? analysis.score + " 分" : "—")),
          h("textarea", {
            className: "asd-input asd-inputSm",
            value: v2Text,
            placeholder: "把改完的第二版贴在这里，立刻看分数差与修好了哪些",
            spellCheck: false,
            onChange: function (e) { setV2Text(e.target.value); }
          }),
          h("div", { className: "asd-rowBtns" },
            h("button", {
              type: "button", className: "asd-btn",
              title: "把当前正文复制进第二版框，再在上面改",
              onClick: useV2
            }, "用当前正文当第二版"),
            h("button", {
              type: "button", className: "asd-btn",
              disabled: !v2Text.trim(),
              title: "把第二版载回正文，接着改",
              onClick: pullV2
            }, "把第二版载回正文")
          )
        ),
        cmpResult
          ? h("div", { className: "asd-list" },
            h("div", { className: "asd-cmpSum" },
              h("span", { className: "asd-cmpNum" }, cmpResult.before),
              h("span", { className: "asd-cmpArrow" }, "→"),
              h("span", { className: "asd-cmpNum", "data-tone": toneOf(cmpResult.after) }, cmpResult.after),
              h("span", { className: "asd-cmpDelta", "data-down": String(cmpResult.delta < 0) },
                (cmpResult.delta > 0 ? "+" : "") + cmpResult.delta + " 分")
            ),
            h("div", { className: "asd-cmpStats" },
              h("span", null, "修好 " + cmpResult.fixed.length + " 处"),
              h("span", null, "新引入 " + cmpResult.added.length + " 处"),
              h("span", null, "还在 " + cmpResult.stay.length + " 处")
            ),
            cmpResult.fixed.length
              ? h("div", { className: "asd-card" },
                h("div", { className: "asd-cardTop" }, h("span", { className: "asd-tag" }, "修好了")),
                cmpResult.fixed.slice(0, 12).map(function (it) {
                  return h("div", { key: "f-" + sigOf(it), className: "asd-cmpLine" }, h("b", null, keyLabel(it.dim)), " " + it.snippet);
                })
              )
              : null,
            cmpResult.added.length
              ? h("div", { className: "asd-card" },
                h("div", { className: "asd-cardTop" }, h("span", { className: "asd-tag", "data-kind": "after" }, "新引入")),
                cmpResult.added.slice(0, 12).map(function (it) {
                  return h("div", { key: "a-" + sigOf(it), className: "asd-cmpLine" }, h("b", null, keyLabel(it.dim)), " " + it.snippet);
                })
              )
              : null
          )
          : h("div", { className: "asd-empty" }, v2Text ? "两版里至少有一版字数不够（至少 " + MIN_CHARS + " 字）。" : "第二版还是空的。")
      );

      // —— 批量：整章一次过一遍 ——
      var batchView = h("div", { className: "asd-list" },
        h("div", {
          className: "asd-drop",
          onDragOver: function (e) { e.preventDefault(); },
          onDrop: function (e) {
            e.preventDefault();
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
          }
        },
          h("div", { className: "asd-dropText" }, "把 .txt 拖到这里，按「第 X 章」自动切分"),
          h("label", { className: "asd-btn asd-fileBtn" },
            "选一个 txt 文件",
            h("input", {
              type: "file", accept: ".txt,text/plain",
              style: { display: "none" },
              onChange: function (e) {
                if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
                e.target.value = "";
              }
            })
          )
        ),
        batchRows.length && batchStats
          ? h("div", { className: "asd-list" },
            h("div", { className: "asd-trend" },
              h("div", { className: "asd-trendHead" },
                h("span", null, "共 " + batchStats.n + " 章 · 平均 " + batchStats.avg),
                h("span", {
                  className: "asd-trendDelta",
                  "data-down": String(batchStats.delta < 0)
                }, batchStats.delta === 0
                  ? "首末持平"
                  : (batchStats.delta < 0
                    ? "首章→末章 降 " + Math.abs(batchStats.delta)
                    : "首章→末章 升 " + batchStats.delta)),
                h("span", { className: "asd-trendMin" },
                  "最干净 " + batchStats.lo.title + " " + batchStats.lo.score +
                  " · 最重 " + batchStats.hi.title + " " + batchStats.hi.score)
              ),
              h("div", { className: "asd-trendBars" },
                batchRows.map(function (r) {
                  var pct = r.score == null ? 4 : Math.max(6, Math.round((r.score / 100) * 46));
                  return h("i", {
                    key: "tb-" + r.key,
                    className: "asd-trendBar",
                    "data-tone": r.score == null ? "low" : toneOf(r.score),
                    style: { height: pct + "px" },
                    title: r.title + " · " + (r.score == null ? "太短未评" : r.score + " 分") +
                      (r.delta ? "（较上章 " + (r.delta > 0 ? "+" : "") + r.delta + "）" : "")
                  });
                })
              )
            ),
            h("div", { className: "asd-table" },
              h("div", { className: "asd-tr asd-th" },
                h("span", null, "章节"),
                h("span", null, "字数"),
                h("span", null, "AI 味"),
                h("span", null, "最重三项")
              ),
              batchRows.map(function (r) {
                return h("div", {
                  key: r.key,
                  className: "asd-tr",
                  "data-click": "true",
                  title: "点一下把「" + r.title + "」载入正文，切到诊断页接着改",
                  onClick: function () { loadChapter(r); }
                },
                  h("span", { className: "asd-tdTitle", title: r.title }, r.title),
                  h("span", null, r.chars),
                  h("span", { "data-tone": r.score == null ? "low" : toneOf(r.score), className: "asd-tdScore" },
                    r.score == null ? "—" : r.score,
                    r.delta != null && r.delta !== 0
                      ? h("i", {
                        className: "asd-tdDelta",
                        "data-down": String(r.delta < 0)
                      }, (r.delta < 0 ? "↓" : "↑") + Math.abs(r.delta))
                      : null),
                  h("span", { className: "asd-tdTop" },
                    r.top.map(function (d) { return d.label + " " + d.score; }).join(" · "))
                );
              })
            ),
            h("div", { className: "asd-rowBtns" },
              h("button", { type: "button", className: "asd-headBtn", onClick: function () { setBatch(null); flash("已清空批量结果"); } }, "清空")
            )
          )
          : null
      );

      // —— 错字：本地表 + 模型校对，两边结果合成一张单子 ——
      var pfState = !proof ? "idle" : proof.status;
      var pfText = "本地固定表已经查过一遍，命中的都是确定写错的。";
      if (pfState === "running") pfText = "正在逐句校对…";
      else if (pfState === "error") pfText = "校对失败：" + (proof.error || "未知错误");
      else if (pfState === "done") {
        var pfN = proof.data && proof.data.items ? proof.data.items.length : 0;
        pfText = pfN ? "模型又指出 " + pfN + " 处可疑的地方，已按把握大小排好。" : "模型通读一遍，没再发现别的问题。";
        if (proof.data && proof.data.dropped) pfText += "（" + proof.data.dropped + " 条对不上原文已丢弃）";
      }

      var proofView = h("div", { className: "asd-list" },
        h("div", { className: "asd-rev", "data-state": pfState },
          h("i", { className: "asd-revDot" }),
          h("span", { className: "asd-revText" }, pfText),
          h("button", {
            type: "button", className: "asd-btn",
            disabled: pfState === "running",
            onClick: runProofread
          }, pfState === "done" ? "重新校对" : "模型校对")
        ),
        typoList.length
          ? h("div", { className: "asd-list" },
            h("div", { className: "asd-pfSum" }, "共 " + typoList.length + " 处：" + (function () {
              var loc = 0, mod = 0, i;
              for (i = 0; i < typoList.length; i++) {
                if (typoList[i].source === "local") loc++;
                else mod++;
              }
              return "固定表 " + loc + " 处，模型 " + mod + " 处";
            })()),
            typoList.map(function (t, ti) {
              var box = sentenceBox(settled, sents, t.start, t.end);
              var sev = t.confidence >= 3 ? "确定" : t.confidence === 2 ? "很可能" : "可疑";
              var parts = [];
              if (box && box.start <= t.start && t.end <= box.end) {
                if (t.start > box.start) parts.push(h("span", null, settled.slice(box.start, t.start)));
                parts.push(h("mark", { className: "asd-pfHit" }, settled.slice(t.start, t.end)));
                if (t.end < box.end) parts.push(h("span", null, settled.slice(t.end, box.end)));
              } else {
                parts.push(h("mark", { className: "asd-pfHit" }, t.wrong));
              }
              return h("div", { key: "pf-" + ti, className: "asd-pfRow" },
                h("div", { className: "asd-pfTop" },
                  h("span", { className: "asd-pfTag", "data-strong": String(t.confidence >= 3) },
                    t.source === "local" ? "固定表 · 确定" : "模型 · " + sev),
                  h("span", { className: "asd-pfPos" }, "第 " + (t.start + 1) + " 字")
                ),
                h("div", { className: "asd-pfText" },
                  parts,
                  h("span", { className: "asd-pfFix" }, " → " + t.right),
                  t.reason && t.reason.indexOf(t.right) < 0
                    ? h("span", { className: "asd-pfWhy" }, t.reason)
                    : null
                ),
                h("div", { className: "asd-rowBtns" },
                  h("button", {
                    type: "button", className: "asd-btn",
                    onClick: function () { applyTypo(t); }
                  }, "改成「" + t.right + "」"),
                  h("button", {
                    type: "button", className: "asd-btn",
                    title: "把这个词加进白名单，以后不再报",
                    onClick: function () { addAllow(t.wrong); }
                  }, "这不是错")
                )
              );
            })
          )
          : h("div", { className: "asd-empty" },
            pfState === "done" ? "两边都没查出问题。" : "没查到写错的字。想更稳一点，点上面「模型校对」再逐句过一遍。"
          )
      );

      // 导出：把分项与最该先改的句子拼成一段 Markdown，方便存档或贴给编辑
      var buildReport = function () {
        var md = [];
        var modeLabel = MODES[mode] ? MODES[mode].label : mode;
        md.push("## AI 文风检测报告");
        md.push("");
        md.push("- 文体：" + modeLabel);
        md.push("- 总分：" + (analysis.valid ? analysis.score + " / 100（" + verdict + "）" : "字数不够，未评分"));
        md.push("- 目标分：" + target + (analysis.valid
          ? (analysis.score <= target ? "，已达标" : "，还差 " + (analysis.score - target) + " 分")
          : ""));
        md.push("- 篇幅：" + analysis.chars + " 字 / " + analysis.sentCount + " 句 / " + analysis.paraCount + " 段");
        if (analysis.ignoredCount) md.push("- 已忽略：" + analysis.ignoredCount + " 处，未计分");
        md.push("");
        md.push("### 分项（越高越像 AI）");
        md.push("");
        md.push("| 分项 | 分数 | 观察 |");
        md.push("| --- | --- | --- |");
        for (var i = 0; i < analysis.dims.length; i++) {
          var dr = analysis.dims[i];
          md.push("| " + dr.label + " | " + dr.score + " | " + String(dr.hint || "").replace(/\|/g, "/") + " |");
        }
        if (topList.length) {
          md.push("");
          md.push("### 最该先改的 " + topList.length + " 句");
          md.push("");
          for (var j = 0; j < topList.length; j++) {
            var t = topList[j];
            var kinds = [];
            for (var k = 0; k < t.dims.length; k++) {
              var lbl = keyLabel(t.dims[k]);
              if (kinds.indexOf(lbl) < 0) kinds.push(lbl);
            }
            md.push((j + 1) + ". 降 " + t.delta + " 分 · " + kinds.join("、"));
            md.push("   - 原句：" + String(t.before).replace(/\s+/g, " "));
            md.push("   - 改成：" + String(t.after || "（这条只给建议，不自动改写）").replace(/\s+/g, " "));
          }
        }
        return md.join("\n");
      };

      var revState = review ? review.status : "idle";
      var revText = auto
        ? "本地规则已打分，停顿约 1 秒自动做模型复审，结论并入同一份列表。"
        : "本地规则已打分。点「复审」让大模型指认语义层问题，结论会并进同一份列表。";
      if (revState === "running") revText = "正在调用模型复审…";
      else if (revState === "error") revText = "复审失败：" + (review.error || "未知错误");
      else if (revState === "done") {
        var revN = review.data && review.data.items ? review.data.items.length : 0;
        revText = revN ? "模型复审完成：指出 " + revN + " 处语义问题，已并入分析。" : "模型复审完成：未发现语义层问题。";
        if (review.data && review.data.dropped) revText += "（" + review.data.dropped + " 条对不上原文已丢弃）";
      }

      var body = view === "marks" ? annotView
        : view === "suggest" ? suggestView
          : view === "history" ? historyView
            : view === "top" ? topView
              : view === "compare" ? cmpView
                : view === "batch" ? batchView
                  : view === "proof" ? proofView
                    : diagnoseView;

      return h("div", { className: "asd-root", ref: rootRef },
        h("style", null, CSS),
        h("div", { className: "asd-head" },
          h("div", null,
            h("h2", { className: "asd-title" }, TAB_TITLE),
            h("p", { className: "asd-sub" }, "本地规则打分 · 模型只做语义复审 · 分数始终由本地算"),
            h("div", { className: "asd-modelWrap" },
              h("button", {
                type: "button",
                className: "asd-model",
                "data-open": String(pickOpen),
                "data-picked": String(pickedOn),
                title: route && route.error && !pickedOn
                  ? "读取当前模型失败：" + route.error + "（点一下打开列表）"
                  : "点开从智能体已绑定的模型里挑一个；只影响这个面板的复审，不占用本对话上下文",
                onClick: function () {
                  var next = !pickOpen;
                  setPickOpen(next);
                  if (next) loadRoute();
                }
              },
                effModel
                  ? h("b", null, effModel)
                  : route && route.error
                    ? "模型不可用（" + route.error + "）"
                    : "模型读取中…",
                pickedOn ? h("i", { className: "asd-modelTag" }, "已选") : null,
                h("i", { className: "asd-modelArrow" }, pickOpen ? "▴" : "▾")
              ),
              pickerView
            )
          ),
          h("div", { className: "asd-headBtns" },
            undo
              ? h("button", {
                type: "button", className: "asd-headBtn",
                title: "撤销上一次「" + undo.label + "」，把正文退回改之前（Ctrl/⌘+Z）",
                onClick: undoLast
              }, "撤销")
              : null,
            h("button", {
              type: "button", className: "asd-headBtn",
              title: "清空文本与结果",
              onClick: clearAll
            }, "清空")
          )
        ),
        h("textarea", {
          className: "asd-input",
          value: text,
          placeholder: "粘贴或输入一段中文文本，实时检测「AI 味」……",
          spellCheck: false,
          onChange: function (e) { setText(e.target.value); }
        }),
        h("div", { className: "asd-modeRow" },
          h("span", { className: "asd-modeLabel" }, "文体"),
          h("div", { className: "asd-seg asd-segSm", role: "group", "aria-label": "文体模式" },
            Object.keys(MODES).map(function (k) {
              return h("button", {
                key: k,
                type: "button",
                className: "asd-segBtn",
                role: "radio",
                "aria-checked": String(mode === k),
                "data-on": String(mode === k),
                title: MODES[k].label + "：" + MODES[k].short + "（换模式会重算分数并重新复审）",
                onClick: function () { if (mode !== k) setMode(k); }
              }, MODES[k].label);
            })
          )
        ),
        h("div", { className: "asd-meta" },
          h("span", null, analysis.chars + " 字"),
          h("span", null, analysis.sentCount + " 句"),
          h("span", null, analysis.paraCount + " 段"),
          analysis.chars ? h("span", null, "均句长 " + analysis.avgLen + " 字") : null,
          h("button", {
            type: "button", className: "asd-headBtn asd-metaBtn",
            title: "在全屏窗口里编辑长文（Esc 关闭）",
            onClick: function () { setBig(true); }
          }, "放大")
        ),
        h("div", { className: "asd-score" },
          h(ScoreRing, { score: analysis.score, tone: analysis.tone, valid: analysis.valid }),
          h("div", { className: "asd-verdict" },
            h("span", { className: "asd-verdictTop", "data-tone": analysis.valid ? analysis.tone : "low" }, verdict),
            h("span", { className: "asd-verdictSub" }, verdictSub)
          )
        ),
        h("div", { className: "asd-target" },
          h("span", null, "目标分"),
          h("input", {
            type: "number", min: 0, max: 100, step: 1,
            value: target,
            title: "达到这个分就显示已达标；建议小说压到 25 以下",
            onChange: function (e) {
              var v = parseInt(e.target.value, 10);
              if (!isFinite(v)) { setTarget(DEFAULT_TARGET); return; }
              setTarget(clamp(v, 0, 100));
            }
          }),
          h("div", { className: "asd-chips asd-presets" },
            TARGET_PRESETS.map(function (v) {
              return h("button", {
                key: v,
                type: "button",
                className: "asd-chip",
                "data-on": String(target === v),
                title: "把目标分设为 " + v,
                onClick: function () { setTarget(v); }
              }, String(v));
            })
          ),
          analysis.valid
            ? (analysis.score <= target
              ? h("span", { className: "asd-hit" }, "已达标（低于目标 " + (target - analysis.score) + " 分）")
              : h("span", { className: "asd-hit", "data-miss": "true" }, "还差 " + (analysis.score - target) + " 分"))
            : null,
          h("button", {
            type: "button", className: "asd-btn",
            title: "把分项分数与最该先改的句子拼成一段 Markdown 复制出去",
            onClick: function () { copyText(buildReport(), "已复制检测报告"); }
          }, "复制报告"),
          h("button", {
            type: "button", className: "asd-btn",
            title: "自定义词表：黑名单永远算套话，白名单永远不算",
            onClick: function () { setShowOpt(!showOpt); }
          }, showOpt ? "收起自定义" : "自定义词表")
        ),
        showOpt
          ? h("div", { className: "asd-optBox" },
            h("div", { className: "asd-optRow" },
              h("span", { className: "asd-optLabel" }, "黑名单"),
              h("textarea", {
                className: "asd-optInput",
                value: (custom.deny || []).join("\n"),
                placeholder: "一行一个，或逗号隔开。这些词一律当套话算。",
                spellCheck: false,
                onChange: function (e) { setDeny(e.target.value); }
              })
            ),
            h("div", { className: "asd-optRow" },
              h("span", { className: "asd-optLabel" }, "白名单"),
              h("textarea", {
                className: "asd-optInput",
                value: (custom.allow || []).join("\n"),
                placeholder: "一行一个。这些词即使在内置词表里也不算。",
                spellCheck: false,
                onChange: function (e) { setAllow(e.target.value); }
              })
            ),
            h("div", { className: "asd-optRow" },
              h("span", { className: "asd-optLabel" }, "不计分的项"),
              h("div", { className: "asd-chips" },
                analysis.dims.map(function (d) {
                  var off = !!(ignore.dims && ignore.dims[d.key]);
                  return h("button", {
                    key: d.key,
                    type: "button",
                    className: "asd-chip",
                    "data-on": String(off),
                    title: off
                      ? "点一下恢复这一项计分"
                      : "点一下：「" + d.label + "」这一项不算分，也不再提示（适合你的文体用不上这项时）",
                    onClick: function () { ignoreDim(d.key); }
                  }, d.label);
                })
              )
            ),
            h("div", { className: "asd-optRow" },
              h("span", { className: "asd-optLabel" }, "配置备份"),
              h("div", { className: "asd-cfg" },
                h("div", { className: "asd-cfgBtns" },
                  h("button", {
                    type: "button", className: "asd-btn",
                    title: "把文体、目标分、字号、词表、忽略表打成一段 JSON 并复制",
                    onClick: exportConfig
                  }, "导出"),
                  h("button", {
                    type: "button", className: "asd-btn",
                    title: "把框里的 JSON 应用回来（会覆盖当前这几项设置）",
                    onClick: importConfig
                  }, "导入")
                ),
                h("textarea", {
                  className: "asd-optInput asd-cfgText",
                  value: cfgText,
                  placeholder: "点「导出」会生成一段 JSON；换机器时把它粘到这里，再点「导入」。",
                  spellCheck: false,
                  onChange: function (e) { setCfgText(e.target.value); }
                })
              )
            ),
            ignoredList.length
              ? h("div", { className: "asd-ignored" },
                h("span", null, "已忽略："),
                ignoredList.map(function (sig) {
                  return h("span", { key: sig, className: "asd-ignoredTag" },
                    sig.replace("|", " · "),
                    h("button", { type: "button", className: "asd-btn", onClick: function () { unignoreIssue(sig); } }, "恢复")
                  );
                })
              )
              : null
          )
          : null,
        h("div", { className: "asd-rev", "data-state": revState },
          h("i", { className: "asd-revDot" }),
          h("span", { className: "asd-revText" }, revText),
          h("label", {
            className: "asd-auto",
            title: auto ? "点一下关闭自动复审" : "点一下开启：停顿后自动复审"
          },
            h("input", {
              type: "checkbox",
              checked: auto,
              onChange: function (e) {
                var v = !!e.target.checked;
                setAuto(v);
                saveAuto(v);
              }
            }),
            h("span", null, "自动")
          ),
          h("button", {
            type: "button", className: "asd-btn",
            disabled: revState === "running",
            onClick: runReview
          }, revState === "done" ? "重新复审" : "复审")
        ),
        h("div", { className: "asd-seg", role: "tablist" },
          h("button", {
            type: "button", className: "asd-segBtn", role: "tab",
            "data-on": String(view === "diagnose"),
            onClick: function () { setView("diagnose"); }
          }, "诊断 " + analysis.dims.length),
          h("button", {
            type: "button", className: "asd-segBtn", role: "tab",
            "data-on": String(view === "marks"),
            onClick: function () { setView("marks"); }
          }, "标注"),
          h("button", {
            type: "button", className: "asd-segBtn", role: "tab",
            "data-on": String(view === "suggest"),
            onClick: function () { setView("suggest"); }
          }, "建议 " + liveIssues.length + (analysis.ignoredCount ? " · 忽略 " + analysis.ignoredCount : "")),
          h("button", {
            type: "button", className: "asd-segBtn", role: "tab",
            "data-on": String(view === "proof"),
            title: "错字是文本对错，跟 AI 味分数无关，所以单开一页",
            onClick: function () { setView("proof"); }
          }, "错字 " + typoList.length),
          h("button", {
            type: "button", className: "asd-segBtn", role: "tab",
            "data-on": String(view === "history"),
            onClick: function () { setView("history"); }
          }, "记录 " + history.length),
          h("button", {
            type: "button", className: "asd-segBtn", role: "tab",
            "data-on": String(view === "top"),
            onClick: function () { setView("top"); }
          }, "重点" + (topList.length ? " " + topList.length : "")),
          h("button", {
            type: "button", className: "asd-segBtn", role: "tab",
            "data-on": String(view === "compare"),
            onClick: function () { setView("compare"); }
          }, "对比"),
          h("button", {
            type: "button", className: "asd-segBtn", role: "tab",
            "data-on": String(view === "batch"),
            onClick: function () { setView("batch"); }
          }, "批量"),
        ),
        body,
        view === "diagnose" || view === "top" || view === "compare" || view === "batch" || view === "proof" ? null : h("div", { className: "asd-card" },
          h("div", { className: "asd-cardTop" },
            h("span", { className: "asd-tag" }, "改写"),
            h("span", null, analysis.valid
              ? (analysis.rewrite.applied
                ? "可自动改写 " + analysis.rewrite.applied + " 处"
                : "没有可自动改写的地方")
              : "等待更多文字")
          ),
          analysis.valid
            ? h("div", { className: "asd-rwOut" }, analysis.rewrite.text)
            : h("div", { className: "asd-empty" }, "先输入至少 " + MIN_CHARS + " 字。"),
          h("div", { className: "asd-rowBtns" },
            h("button", {
              type: "button", className: "asd-btn", "data-primary": "true",
              onClick: function () { copyText(analysis.rewrite.text, "已复制改写后的文本"); }
            }, "复制改写文本"),
            h("button", {
              type: "button", className: "asd-btn",
              onClick: replaceAll
            }, "替换原文")
          )
        ),
        big
          ? h("div", { className: "asd-big" },
            h("div", { className: "asd-bigBar" },
              h("span", { className: "asd-bigTitle" }, "放大编辑"),
              h("span", { className: "asd-bigHint" }, "内容实时同步，Esc 或点「关闭」退出"),
              h("button", {
                type: "button", className: "asd-headBtn",
                onClick: function () { setBig(false); }
              }, "关闭")
            ),
            h("textarea", {
              className: "asd-input asd-bigInput",
              value: text,
              spellCheck: false,
              placeholder: "粘贴或输入一段中文文本……",
              onChange: function (e) { setText(e.target.value); }
            })
          )
          : null,
        toast ? h("div", { className: "asd-toast" }, toast) : null
      );
    }

    /* ------------------------------------------------------------------ *
     * Sidebar tab registration
     * ------------------------------------------------------------------ */

    function probe(ctx, name) {
      // cordis 的 ctx 是 Proxy：访问没有 inject 的服务会直接抛
      // 「cannot get property "X" without inject」。两次访问都必须包住，
      // 否则 apply 里任何一次探测失败都会冒到 boot 审计里。
      try {
        var svc = typeof ctx.get === "function" ? ctx.get(name, false) : null;
        if (svc) return svc;
      } catch (e) { /* strict lookup missed */ }
      try {
        return ctx[name] || null;
      } catch (e2) { /* property access without inject */ }
      return null;
    }

    function registerTab(ctx) {
      var disposers = [];

      function track(fn) {
        try {
          if (typeof ctx.effect === "function") {
            disposers.push(ctx.effect(fn));
            return;
          }
        } catch (e) { /* fall through to direct call */ }
        try {
          var out = fn();
          if (typeof out === "function") disposers.push(out);
        } catch (e) { /* 绝不让挂载失败冒出去 */ }
      }

      var mounted = false;
      var retries = 0;

      var mountOnce = function () {
        if (mounted) return;
        try {
          mountInner();
        } catch (e) { /* 任何异常都不冒到 boot */ }
      };

      var mountInner = function () {
        var tabs = probe(ctx, "sidebarRightTabs");
        var right = probe(ctx, "sidebarRight");
        // 只把「页签类型注册表」当作必要条件；sidebarRight 只是关闭页签时的辅助句柄，
        // 它并不是一个稳定的客户端服务，缺了它也必须照常注册页签（否则侧栏里就没有本工具）。
        if (!tabs || typeof tabs.register !== "function") {
          // 侧栏服务可能比本插件晚一点就绪。这里只做退避重试，绝不抛错：
          // 客户端 apply 抛错会让 cordis 把这个 entry 判成 failed，进而拖垮整个 web boot。
          if (retries++ < 40) setTimeout(function () { track(mountOnce); }, 150);
          return function () {};
        }

        var offType = tabs.register({
          id: PACKAGE,
          kind: TAB_KIND,
          title: function () { return TAB_TITLE; },
          keepMounted: true,
          guide: [{
            id: PACKAGE,
            order: 40,
            title: function () { return TAB_TITLE; },
            description: function () { return "本地规则引擎检测中文文本的「AI 味」，给出分项诊断与改写建议。"; }
          }]
        });

        var offBody = null;
        try {
          offBody = ctx.slots.inject("sidebar.right.pane.tab", function () {
            return ctx.slots.register(
              { name: "sidebar.right.pane.tab", key: PACKAGE },
              StyleDetectorTab
            );
          });
        } catch (e) {
          offBody = null;
        }

        return function () {
          if (typeof offBody === "function") { try { offBody(); } catch (e) { /* ignore */ } }
          if (typeof offType === "function") { try { offType(); } catch (e) { /* ignore */ } }
          // 只关闭本插件 kind 的页签，不碰其它任何页签
          try {
            if (right && right.openTabs && typeof right.openTabs.getSnapshot === "function") {
              var open = right.openTabs.getSnapshot() || [];
              for (var i = 0; i < open.length; i++) {
                if (open[i] && open[i].kind === TAB_KIND) {
                  var sid = open[i].sessionId;
                  try {
                    if (typeof right.closeIn === "function" && typeof sid === "string") {
                      right.closeIn(sid, open[i].id);
                    } else if (typeof right.close === "function") {
                      right.close(open[i].id);
                    }
                  } catch (e) { /* already gone */ }
                }
              }
            }
          } catch (e) { /* sidebar surface gone */ }
        };
        mounted = true;
      };

      track(mountOnce);

      return function () {
        for (var i = 0; i < disposers.length; i++) {
          try { disposers[i](); } catch (e) { /* ignore */ }
        }
        disposers.length = 0;
      };
    }

    var module = { exports: {} };
    module.exports.inject = ["slots"];
    module.exports.apply = function (ctx) {
      // 兜底：这个函数一旦抛错，cordis 会把本 entry 判成 failed，
      // 而前端 boot 审计是「有一个 entry 没 active 就整页报错」，等于整个 UI 打不开。
      try {
        return registerTab(ctx);
      } catch (e) {
        try { console.error("[style-detector] apply failed", e); } catch (ignore) { /* noop */ }
        return function () {};
      }
    };
    return module.exports;
  }
});
