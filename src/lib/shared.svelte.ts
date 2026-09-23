let playedintro = $state(false);

export function getPlayedIntro() {
    return playedintro;
}

export function setPlayed() {
    playedintro = true;
}