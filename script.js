document.addEventListener("DOMContentLoaded", () => {
  const notesContainer = document.getElementById("notesContainer");
  const newNoteBtn = document.getElementById("newNoteBtn");
  const noteModal = document.getElementById("noteModal");
  const noteText = document.getElementById("noteText");
  const saveNote = document.getElementById("saveNote");
  const closeModal = document.getElementById("closeModal");

  let notes = JSON.parse(localStorage.getItem("notes")) || [];

  const displayNotes = () => {
    notesContainer.innerHTML = "";
    notes.forEach((note, index) => {
      const noteEl = document.createElement("div");
      noteEl.classList.add("note");
      noteEl.innerHTML = `
        <button class="delete" data-index="${index}">x</button>
        <p>${note}</p>
      `;
      notesContainer.appendChild(noteEl);
    });
  };

  newNoteBtn.addEventListener("click", () => {
    noteModal.style.display = "flex";
    noteText.value = "";
  });

  closeModal.addEventListener("click", () => {
    noteModal.style.display = "none";
  });

  saveNote.addEventListener("click", () => {
    if (noteText.value.trim() !== "") {
      notes.push(noteText.value.trim());
      localStorage.setItem("notes", JSON.stringify(notes));
      displayNotes();
      noteModal.style.display = "none";
    }
  });

  notesContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete")) {
      const index = e.target.getAttribute("data-index");
      notes.splice(index, 1);
      localStorage.setItem("notes", JSON.stringify(notes));
      displayNotes();
    }
  });

  displayNotes();
});
