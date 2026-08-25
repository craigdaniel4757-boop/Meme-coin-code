"use client";

import { useState } from "react";
import { GAMES } from "@/lib/games";
import type { GameId, GeneratedImageResult } from "@/types";
import { GameSelector } from "@/components/GameSelector";
import { BossForm } from "@/components/BossForm";
import { ImageGallery } from "@/components/ImageGallery";
import { AmbientParticles } from "@/components/AmbientParticles";
import { GameIcon } from "@/components/GameIcon";
import { Footer } from "@/components/Footer";

export default function Home() {
  const [selectedGameId, setSelectedGameId] = useState<GameId | null>(null);
  const [bossIdea, setBossIdea] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedImageResult[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const game = selectedGameId ? GAMES[selectedGameId] : null;

  function handleSelectGame(id: GameId) {
    setSelectedGameId(id);
    setBossIdea("");
    setResults(null);
    setErrorMessage(null);
  }

  function handleBack() {
    setSelectedGameId(null);
    setBossIdea("");
    setResults(null);
    setErrorMessage(null);
  }

  async function handleGenerate() {
    if (!selectedGameId || !bossIdea.trim()) return;
    setIsGenerating(true);
    setErrorMessage(null);
    setResults(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: selectedGameId, bossIdea: bossIdea.trim() }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.images) setResults(data.images);
        setErrorMessage(data?.error ?? "Something went wrong generating images.");
        return;
      }

      setResults(data.images);
    } catch {
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div data-game={selectedGameId ?? undefined} className="relative min-h-screen bg-vignette">
      {selectedGameId && <AmbientParticles gameId={selectedGameId} />}

      <main className="relative mx-auto max-w-4xl px-4 py-14 sm:py-20">
        <header className="text-center">
          <h1 className="font-heading text-4xl text-accent sm:text-5xl">BossForge</h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">
            Pick a game, describe a boss idea, and get three concept renders built to match that
            game&apos;s exact art style — armor, palette, lighting, and all.
          </p>
        </header>

        <section className="mt-12">
          {!game && <GameSelector onSelect={handleSelectGame} />}

          {game && (
            <div className="animate-fade-up">
              <button
                type="button"
                onClick={handleBack}
                className="mb-6 text-sm text-ink-muted transition-colors hover:text-accent"
              >
                ← Choose a different game
              </button>

              <div className="panel mb-6 flex items-center gap-4 p-5">
                <GameIcon gameId={game.id} className="h-12 w-12 shrink-0 text-accent" />
                <div>
                  <h2 className="font-heading text-2xl text-accent">{game.name}</h2>
                  <p className="text-sm text-ink-muted">{game.description}</p>
                </div>
              </div>

              <BossForm
                game={game}
                bossIdea={bossIdea}
                onChange={setBossIdea}
                onSubmit={handleGenerate}
                isGenerating={isGenerating}
              />

              {errorMessage && (
                <div
                  className="panel mt-6 p-4 text-sm"
                  style={{ borderColor: "var(--accent)", color: "var(--text)" }}
                >
                  {errorMessage}
                </div>
              )}

              <ImageGallery isGenerating={isGenerating} results={results} gameName={game.name} />
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
