const items = document.querySelectorAll('.sidebar p');
const canvas = document.querySelector('.canvas');

items.forEach(item => {
item.addEventListener('dragstart', (e) => {
e.dataTransfer.setData("text/plain", item.innerText);
});
});

canvas.addEventListener('dragover', (e) => {
e.preventDefault();
});

canvas.addEventListener('drop', (e) => {
e.preventDefault();

const data = e.dataTransfer.getData("text/plain");
let element;

if (data === "Text") {
element = document.createElement("p");
element.innerText = "Editable Text";
element.contentEditable = true;
}

if (data === "Button") {
element = document.createElement("button");
element.innerText = "Click Me";
}

if (data === "Image") {
element = document.createElement("img");
element.src = "https://picsum.photos/100";
}

if (element) {
canvas.appendChild(element);
}
});
function downloadHTML() {
const content = document.querySelector('.canvas').innerHTML;

const fullHTML = `

  <!DOCTYPE html>

  <html>
  <head>
    <title>My Website</title>
  </head>
  <body>
    ${content}
  </body>
  </html>
  `;

const blob = new Blob([fullHTML], { type: "text/html" });
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = "website.html";
a.click();
}
