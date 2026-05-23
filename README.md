# HTML Tools

A static collection of small tools. Each tool lives in its own folder and uses
plain HTML, CSS, and JavaScript.

## Structure

```text
/
  index.html
  styles.css
  main.js
  tools.js
  tool-slug/
    index.html
    styles.css
    script.js
```

## Adding a Tool

1. Create a new folder using a URL-safe slug, for example `color-converter/`.
2. Add that tool's `index.html`, CSS, and JavaScript inside the folder.
3. Add an entry to `tools.js`:

```js
{
  name: "Color Converter",
  description: "Convert colors between HEX, RGB, HSL, and CSS names.",
  path: "color-converter/",
  tags: ["color", "css"]
}
```
