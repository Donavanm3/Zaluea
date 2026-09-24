var updates = [
    {message: "New game: Autobahn Outlaws - an open-world crime game across all of Germany!"},
    {message: "Welcome to the 3rd official release of Andyum!"}
];
var updatespage = document.getElementById("updatespage");
for(let item of updates) {
    let a = document.createElement("updatespage");
    a.className = "updatespage";
    var title = document.createElement("message");
    title.textContent = item.message;
    a.appendChild(title);
    updatespage.appendChild(a);
}
