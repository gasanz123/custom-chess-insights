// Knowledge.js - Persistent Knowledge Accumulation System
// NEVER deletes knowledge, only adds/enriches

class KnowledgeBase {
    constructor() {
        this.storageKey = 'chess-insights-knowledge';
        this.persistenceDisabled = false;
        this.maxPersistedInsights = 20000;
        this.load();
    }

    load() {
        this.data = {
            version: 1,
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            positionsAnalyzed: 0,
            patterns: { openings: {}, tactics: {}, positional: {}, mistakes: {}, endgames: {} },
            insights: [],
            concepts: {}
        };
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (!parsed || !Array.isArray(parsed.insights) || !parsed.patterns || !parsed.concepts) {
                    throw new Error('Invalid saved knowledge');
                }
                this.data = parsed;
            } else {
                this.save();
            }
        } catch (error) {
            // Private browsers or damaged saved data must not stop board analysis.
            // Preserve existing storage and continue with a fresh in-memory session.
            this.persistenceDisabled = true;
            console.warn('Knowledge storage unavailable; continuing in memory.', error);
        }
    }

    save() {
        if (this.persistenceDisabled) return;
        this.data.lastUpdated = new Date().toISOString();
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        } catch (e) {
            // Handle browser quota limits gracefully.
            if (this.isQuotaError(e)) {
                this.compactForStorage();
                try {
                    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
                    return;
                } catch (_) {
                    // Last resort: keep app functional in-memory.
                    this.persistenceDisabled = true;
                    console.warn('Storage quota exceeded. Continuing in-memory only.');
                    return;
                }
            }
            this.persistenceDisabled = true;
            console.warn('Knowledge storage unavailable; continuing in memory.', e);
        }
    }

    // Record a position analysis
    recordPosition(fen, insights) {
        this.data.positionsAnalyzed++;
        const uniqueInsights = [];
        const seen = new Set();
        insights.forEach((insight) => {
            const key = [
                fen,
                insight.category || '',
                insight.type || '',
                insight.pattern || '',
                insight.move || '',
                insight.explanation || ''
            ].join('|');
            if (seen.has(key)) return;
            seen.add(key);
            uniqueInsights.push(insight);
        });

        uniqueInsights.forEach((insight) => {
            this.addInsight(insight, fen);
        });

        // Keep persisted payload from growing without bound.
        if (this.data.insights.length > this.maxPersistedInsights) {
            this.data.insights = this.data.insights.slice(-this.maxPersistedInsights);
        }
        this.save();
    }

    // Add an insight with position reference
    addInsight(insight, fen) {
        // Avoid storing exact duplicates for the same FEN repeatedly.
        const exists = this.data.insights.some((existing) =>
            existing.fen === fen &&
            (existing.category || '') === (insight.category || '') &&
            (existing.type || '') === (insight.type || '') &&
            (existing.pattern || '') === (insight.pattern || '') &&
            (existing.move || '') === (insight.move || '') &&
            (existing.explanation || '') === (insight.explanation || '')
        );
        if (exists) return;

        const record = {
            id: Date.now() + Math.random(),
            fen: fen,
            timestamp: new Date().toISOString(),
            ...insight
        };
        
        this.data.insights.push(record);
        
        // Also update pattern count
        if (insight.pattern) {
            const category = insight.category || 'tactics';
            if (!this.data.patterns[category]) {
                this.data.patterns[category] = {};
            }
            if (!this.data.patterns[category][insight.pattern]) {
                this.data.patterns[category][insight.pattern] = {
                    count: 0,
                    firstSeen: new Date().toISOString(),
                    examples: []
                };
            }
            this.data.patterns[category][insight.pattern].count++;
            if (
                this.data.patterns[category][insight.pattern].examples.length < 5 &&
                !this.data.patterns[category][insight.pattern].examples.includes(fen)
            ) {
                this.data.patterns[category][insight.pattern].examples.push(fen);
            }
        }
        
        // Update concept if applicable
        if (insight.concept) {
            if (!this.data.concepts[insight.concept]) {
                this.data.concepts[insight.concept] = {
                    count: 0,
                    description: insight.explanation,
                    examples: []
                };
            }
            this.data.concepts[insight.concept].count++;
            if (
                this.data.concepts[insight.concept].examples.length < 10 &&
                !this.data.concepts[insight.concept].examples.includes(fen)
            ) {
                this.data.concepts[insight.concept].examples.push(fen);
            }
        }
    }

    isQuotaError(e) {
        if (!e) return false;
        const msg = String(e.message || e).toLowerCase();
        return (
            e.name === 'QuotaExceededError' ||
            e.code === 22 ||
            msg.includes('quota') ||
            msg.includes('exceeded')
        );
    }

    compactForStorage() {
        // Deduplicate insights, keep newest entries first.
        const seen = new Set();
        const compacted = [];
        for (let i = this.data.insights.length - 1; i >= 0; i--) {
            const insight = this.data.insights[i];
            const key = [
                insight.fen || '',
                insight.category || '',
                insight.type || '',
                insight.pattern || '',
                insight.move || '',
                insight.explanation || ''
            ].join('|');
            if (seen.has(key)) continue;
            seen.add(key);
            compacted.push(insight);
            if (compacted.length >= this.maxPersistedInsights) break;
        }
        compacted.reverse();
        this.data.insights = compacted;
    }

    // Get related insights from past analyses
    getRelatedInsights(fen) {
        // Simple similarity - same opening or piece configuration
        return this.data.insights.filter(insight => {
            // Check if similar position (same pawn structure, same pieces)
            return this.isSimilarPosition(insight.fen, fen);
        }).slice(-10); // Last 10 related insights
    }

    isSimilarPosition(fen1, fen2) {
        // Simplified similarity check - same pawn structure
        const getPiecePlacement = (fen) => fen.split(' ')[0];
        const placement1 = getPiecePlacement(fen1);
        const placement2 = getPiecePlacement(fen2);
        
        // Check pawn positions similarity
        const pawns1 = placement1.replace(/[^pP]/g, '');
        const pawns2 = placement2.replace(/[^pP]/g, '');
        
        return pawns1.length === pawns2.length;
    }

    // Get stats
    getStats() {
        let patternsLearned = 0;
        Object.values(this.data.patterns).forEach(category => {
            patternsLearned += Object.keys(category).length;
        });

        return {
            positionsAnalyzed: this.data.positionsAnalyzed,
            patternsLearned: patternsLearned,
            conceptsLearned: Object.keys(this.data.concepts).length,
            totalInsights: this.data.insights.length
        };
    }

    // Get top patterns
    getTopPatterns(limit = 10) {
        const allPatterns = [];
        
        Object.entries(this.data.patterns).forEach(([category, patterns]) => {
            Object.entries(patterns).forEach(([name, data]) => {
                allPatterns.push({
                    name,
                    category,
                    count: data.count,
                    firstSeen: data.firstSeen
                });
            });
        });

        return allPatterns
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    // Export for backup
    export() {
        return JSON.stringify(this.data, null, 2);
    }

    // Import from backup
    import(jsonData) {
        try {
            const imported = JSON.parse(jsonData);
            // Merge instead of replace to preserve existing knowledge
            this.mergeKnowledge(imported);
            this.save();
            return true;
        } catch (e) {
            console.error('Import failed:', e);
            return false;
        }
    }

    mergeKnowledge(imported) {
        // Increment counts, don't replace
        this.data.positionsAnalyzed += imported.positionsAnalyzed || 0;
        
        // Merge insights
        if (imported.insights) {
            this.data.insights.push(...imported.insights);
        }
        
        // Merge patterns (add counts)
        Object.entries(imported.patterns || {}).forEach(([category, patterns]) => {
            if (!this.data.patterns[category]) {
                this.data.patterns[category] = {};
            }
            Object.entries(patterns).forEach(([name, data]) => {
                if (!this.data.patterns[category][name]) {
                    this.data.patterns[category][name] = data;
                } else {
                    this.data.patterns[category][name].count += data.count;
                }
            });
        });
        
        // Merge concepts
        Object.entries(imported.concepts || {}).forEach(([concept, data]) => {
            if (!this.data.concepts[concept]) {
                this.data.concepts[concept] = data;
            } else {
                this.data.concepts[concept].count += data.count;
            }
        });
    }
}

// Global instance
window.knowledgeBase = new KnowledgeBase();
