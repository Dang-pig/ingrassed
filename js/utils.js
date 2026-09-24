/**
 * Unified Parser Function: GenerateDOMFromText
 * Converts formatted text (!bold!, *italic*, _underline_, \) into DOM nodes.
 * 
 * @param {string} text - Formatted input text
 * @param {string|HTMLElement} target - Target element ID or DOM element node
 * @param {string|null} lineWrapperTag - Tag to wrap lines in ('p' for paragraphs, null for direct inline parsing)
 */
function GenerateDOMFromText(text, target, lineWrapperTag = 'p') {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container || !text) return;

  const symbolMap = {
    '#': 'font-bold',      // or 'font-bolder'
    '*': 'font-italic',
    '_': 'text-underlined',
    '^': 'font-bolder'
  };

  const lines = text.split(/\r?\n/);

  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) return;

    // Create line container (<p>) if tag specified, otherwise append directly into target container
    const lineEl = lineWrapperTag ? document.createElement(lineWrapperTag) : container;

    // Stack tracks open formatting tags: [{ type: 'root'|'!'|'*'|'_', element: HTMLElement }]
    const stack = [{ type: 'root', element: lineEl }];
    let textBuffer = '';
    let i = 0;

    function flushBuffer() {
      if (textBuffer.length > 0) {
        const currentParent = stack[stack.length - 1].element;
        currentParent.appendChild(document.createTextNode(textBuffer));
        textBuffer = '';
      }
    }

    while (i < line.length) {
      const char = line[i];

      // 1. Handle Escape Character (\)
      if (char === '\\') {
        if (i + 1 < line.length) {
          textBuffer += line[i + 1];
          i += 2;
        } else {
          textBuffer += '\\';
          i++;
        }
        continue;
      }

      // 2. Handle Formatting Symbols (!, *, _)
      if (symbolMap[char]) {
        flushBuffer();

        let foundIndex = -1;
        for (let j = stack.length - 1; j >= 1; j--) {
          if (stack[j].type === char) {
            foundIndex = j;
            break;
          }
        }

        if (foundIndex !== -1) {
          // Close active formatting span
          stack.splice(foundIndex, stack.length - foundIndex);
        } else {
          // Open new formatting span
          const span = document.createElement('span');
          span.className = symbolMap[char];

          const currentParent = stack[stack.length - 1].element;
          currentParent.appendChild(span);

          stack.push({ type: char, element: span });
        }
        i++;
      } else {
        // 3. Regular Character
        textBuffer += char;
        i++;
      }
    }

    flushBuffer();

    // Only append lineEl if a wrapper tag (like 'p') was created
    if (lineWrapperTag) {
      container.appendChild(lineEl);
    }
  });
}

/**
 * Section Generator Function
 * Creates complete section elements and calls GenerateDOMFromText twice (for title and body).
 */
function createSection(config) {
  const {
    parentContainerId = 'section-container',
    sectionId = '',
    contentId = '',
    bgColor = '',
    titleBgColor = '',
    titleColor = '',
    textColor = '',
    titleText = '', // Formatted string for title
    bodyText = '',   // Formatted string for body
    backgroundHoverClass = ''
  } = config;

  function applyColor(element, property, value) {
    if (!value) return;
    if (value.startsWith('#') || value.startsWith('rgb') || value.startsWith('var')) {
      element.style[property] = value;
    } else {
      element.classList.add(value);
    }
  }

  // 1. Outer section container
  const section = document.createElement('section');
  section.className = 'p-50 bg-hover d-flex flex-col w-100';
  if (sectionId) section.id = sectionId;
  section.classList.add(bgColor);
  section.classList.add(backgroundHoverClass);

  // 2. Sticky Title header
  const titleDiv = document.createElement('div');
  titleDiv.className = 'sticky top-10 rounded-8 h-50px d-flex flex-row justify-start items-center p-16 bg-hover bg-hover-cream shadow';
  titleDiv.classList.add(titleBgColor)

  const titleSpan = document.createElement('span');
  titleSpan.className = 'font-150pc font-sbold';
  if (titleColor) titleSpan.classList.add(titleColor);
  titleDiv.classList.add(textColor)
  titleDiv.appendChild(titleSpan);

  // Call #1: Render Title text directly into titleSpan (no <p> wrappers)
  GenerateDOMFromText(titleText, titleSpan, null);

  // 3. Body Content container
  const contentDiv = document.createElement('div');
  contentDiv.className = 'd-flex flex-col text-justify w-100 p-20 px-100 font-140pc line-150';
  if (contentId) contentDiv.id = contentId;
  applyColor(contentDiv, 'color', textColor);

  // Call #2: Render Body text into contentDiv (wrapped in <p> tags)
  GenerateDOMFromText(bodyText, contentDiv, 'p');

  // 4. Append to DOM
  section.appendChild(titleDiv);
  section.appendChild(contentDiv);

  const parent = document.getElementById(parentContainerId);
  if (parent) parent.appendChild(section);

  return section;
}

// Scroll hint

const createScrollHint = () => {
    if (document.getElementById("scroll-hint")) return;

    const hint = document.createElement("div");
    hint.id = "scroll-hint";

    Object.assign(hint.style, {
        position: "fixed",
        left: "50%",
        bottom: "20px",
        transform: "translateX(-50%)",
        width: "90%",
        height: "5vh",
        background: "rgba(16, 49, 0, 0.6)",
        color: "white",
        zIndex: "9999",
        opacity: "1",
        transition: "opacity 0.3s ease",
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "14px",
        fontFamily: "sans-serif",
        borderRadius: "10px",
        boxSizing: "border-box"
    });

    const text = document.createElement("div");
    text.textContent = "Scroll down";

    const arrow = document.createElement("div");
    arrow.innerHTML = `
        <svg width="20" height="12" viewBox="0 0 20 12">
            <path
                d="M2 2 L10 10 L18 2
                   M2 0 L10 8 L18 0"
                fill="none"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    `;

    hint.appendChild(text);
    hint.appendChild(arrow);
    document.body.appendChild(hint);
};

const removeScrollHint = () => {
    const hint = document.getElementById("scroll-hint");
    if (hint) hint.style.opacity = "0";
};

const updateScrollHint = () => {
    const isScrollable =
        document.documentElement.scrollHeight > window.innerHeight;

    if (isScrollable) {
        const hint = document.getElementById("scroll-hint");

        if (!hint) {
            createScrollHint();
        } else {
            hint.style.opacity = "1";
        }
    }
};

updateScrollHint();

window.addEventListener("scroll", removeScrollHint, { once: true });

window.addEventListener("resize", updateScrollHint);