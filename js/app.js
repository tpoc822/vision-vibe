// js/app.js — StudyFlow 앱 로직. 지금은 localStorage 저장/불러오기 틀만 있고, 기능은 3단계에서 구현합니다.
const STORAGE_KEY = "studyflow:tasks";
function loadTasks() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
function saveTasks(tasks) { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
console.log("StudyFlow 준비 완료. 저장된 할 일:", loadTasks().length);
