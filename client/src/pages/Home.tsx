import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Loader2, Sparkles, TrendingUp, AlertTriangle, Lightbulb, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface StoryResult {
  story: string;
  keyInsights: string[];
  risks: string[];
  opportunities: string[];
  recommendedActions: string[];
}

/**
 * DIVI STORY - Home Page
 * 
 * Design Philosophy: Modern Data Narrative
 * - Dark theme with indigo primary and teal accents
 * - Asymmetric two-column layout (input left, results right)
 * - Smooth animations and loading states
 * - Premium SaaS aesthetic with subtle depth
 */
export default function Home() {
  const [businessData, setBusinessData] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<StoryResult | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKeyInput, setShowApiKeyInput] = useState(true);

  const generateStory = async () => {
    if (!businessData.trim()) {
      toast.error("Please paste some business data first");
      return;
    }

    if (!apiKey.trim()) {
      toast.error("Please enter your OpenRouter API key");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.href,
          "X-Title": "DIVI STORY",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-2-70b-chat",
          messages: [
            {
              role: "system" as const,
              content: `You are a business intelligence analyst who transforms raw business data into compelling narratives. 
              
              Analyze the provided business data and generate:
              1. A concise business story (2-3 sentences) that explains what the data means
              2. 3-4 key insights (bullet points)
              3. 2-3 risks or concerns
              4. 2-3 opportunities for growth
              5. 3-4 recommended actions
              
              Format your response as valid JSON with these exact keys: story, keyInsights (array), risks (array), opportunities (array), recommendedActions (array).
              Keep language professional but accessible. Be specific and actionable.`,
            },
            {
              role: "user",
              content: `Analyze this business data and provide insights:\n\n${businessData}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Failed to generate story");
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Could not parse response");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      setResult(parsed);
      toast.success("Story generated successfully!");
    } catch (error) {
      console.error("Error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate story");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 bg-gradient-to-r from-background via-background to-primary/5 backdrop-blur-md sticky top-0 z-50">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8">
              <img 
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663542662057/cbhMZJ3M3gfEucuwCorWsK/divi-logo-NkuQkNDQP4u2uHiDdtLNFz.webp"
                alt="DIVI STORY"
                className="w-8 h-8 drop-shadow-lg"
              />
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300" />
            </div>
            <h1 className="text-xl font-display font-bold text-foreground tracking-tight">DIVI STORY</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Transform data into narrative intelligence</p>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-border/30 py-12 sm:py-16 bg-gradient-to-b from-background via-primary/5 to-background/50 relative overflow-hidden">
        {/* Subtle data grid background */}
        <div className="absolute inset-0 opacity-5 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><defs><pattern id=%22grid%22 width=%2210%22 height=%2210%22 patternUnits=%22userSpaceOnUse%22><path d=%22M 10 0 L 0 0 0 10%22 fill=%22none%22 stroke=%22white%22 stroke-width=%220.5%22/></pattern></defs><rect width=%22100%22 height=%22100%22 fill=%22url(%23grid)%22/></svg>')] bg-repeat" />
        <div className="container relative z-10">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-3 leading-tight">
              Paste your data. Get your story.
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              AI-powered business narratives that transform raw data into actionable insights in seconds.
            </p>
          </div>
        </div>
      </section>

      {/* Gradient Divider with Data Path Motif */}
      <div className="relative h-1.5 bg-gradient-to-r from-primary via-accent to-accent opacity-70">
        <div className="absolute inset-0 opacity-30 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 4%22><circle cx=%2220%22 cy=%222%22 r=%221%22 fill=%22white%22/><circle cx=%2250%22 cy=%222%22 r=%221%22 fill=%22white%22/><circle cx=%2280%22 cy=%222%22 r=%221%22 fill=%22white%22/></svg>')] bg-repeat-x" />
      </div>

      {/* Main Content */}
      <main className="container py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Input Area */}
          <div className="space-y-6">
            {/* API Key Input */}
            {showApiKeyInput && (
              <Card className="p-4 border-accent/30 bg-card/50">
                <label className="block text-sm font-medium text-foreground mb-2">
                  OpenRouter API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Get your free API key at <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">openrouter.ai</a>
                </p>
              </Card>
            )}

            {/* Data Input */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                Business Data
              </label>
              <Textarea
                value={businessData}
                onChange={(e) => setBusinessData(e.target.value)}
                placeholder="Paste your business data here—sales figures, metrics, updates, performance reports, anything you want analyzed..."
                className="min-h-64 resize-none bg-card/60 border border-border/50 text-foreground placeholder-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/50 rounded-lg transition-all duration-200"
              />
              <p className="text-xs text-muted-foreground">
                Share any business metrics, performance data, or updates you'd like transformed into a narrative.
              </p>
            </div>

            {/* Generate Button */}
            <Button
              onClick={generateStory}
              disabled={isLoading}
              size="lg"
              className="w-full bg-accent hover:bg-accent/85 text-accent-foreground font-semibold transition-all duration-200 active:scale-95 shadow-lg hover:shadow-xl hover:shadow-accent/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Story...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Story
                </>
              )}
            </Button>
          </div>

          {/* Right Column: Results */}
          <div className="space-y-6">
            {!result && !isLoading && (
              <div className="space-y-3 min-h-96">
                {/* Dashboard Preview - Faint Insight Cards */}
                <div className="space-y-3 opacity-20 pointer-events-none">
                  <Card className="p-4 border border-accent/40 bg-card/60">
                    <div className="h-4 bg-accent/20 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-accent/10 rounded w-full mb-2" />
                    <div className="h-3 bg-accent/10 rounded w-5/6" />
                  </Card>
                  <Card className="p-4 border border-accent/40 bg-card/60">
                    <div className="h-4 bg-accent/20 rounded w-1/4 mb-3" />
                    <div className="space-y-2">
                      <div className="h-3 bg-accent/10 rounded w-full" />
                      <div className="h-3 bg-accent/10 rounded w-4/5" />
                    </div>
                  </Card>
                </div>
                
                {/* Active CTA */}
                <Card className="p-8 border border-border/30 bg-gradient-to-br from-card/60 to-card/40 flex flex-col items-center justify-center min-h-64 hover:from-card/70 hover:to-card/50 transition-all duration-300">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center mx-auto mb-4">
                      <TrendingUp className="w-8 h-8 text-accent" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Ready to transform your data</h3>
                    <p className="text-sm text-muted-foreground">
                      Paste your business data and click "Generate Story" to get started.
                    </p>
                  </div>
                </Card>
              </div>
            )}

            {isLoading && (
              <div className="space-y-3">
                {/* Animated Insight Cards Skeleton */}
                <Card className="p-4 border border-accent/40 bg-card/60 animate-pulse">
                  <div className="h-4 bg-accent/20 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-accent/10 rounded w-full mb-2" />
                  <div className="h-3 bg-accent/10 rounded w-5/6" />
                </Card>
                <Card className="p-4 border border-accent/40 bg-card/60 animate-pulse" style={{animationDelay: '100ms'}}>
                  <div className="h-4 bg-accent/20 rounded w-1/4 mb-3" />
                  <div className="space-y-2">
                    <div className="h-3 bg-accent/10 rounded w-full" />
                    <div className="h-3 bg-accent/10 rounded w-4/5" />
                  </div>
                </Card>
                <Card className="p-8 border border-border/30 bg-gradient-to-br from-card/60 to-card/40 flex flex-col items-center justify-center min-h-32">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Sparkles className="w-8 h-8 text-accent" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Generating your story...</h3>
                    <p className="text-sm text-muted-foreground">
                      Our AI is analyzing your data and crafting insights.
                    </p>
                  </div>
                </Card>
              </div>
            )}

            {result && !isLoading && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Business Story */}
                <Card className="p-4 border border-accent/40 bg-card/60 hover:bg-card/80 transition-all duration-200 hover:shadow-lg hover:shadow-accent/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-accent mb-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Business Story
                      </h3>
                      <p className="text-sm text-foreground leading-relaxed">{result.story}</p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.story)}
                      className="p-2 hover:bg-accent/10 rounded-md transition-colors flex-shrink-0"
                      title="Copy story"
                    >
                      <Copy className="w-4 h-4 text-muted-foreground hover:text-accent" />
                    </button>
                  </div>
                </Card>

                {/* Key Insights */}
                <Card className="p-4 border border-accent/40 bg-card/60 hover:bg-card/80 transition-all duration-200 hover:shadow-lg hover:shadow-accent/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" />
                        Key Insights
                      </h3>
                      <ul className="space-y-2">
                        {result.keyInsights.map((insight, i) => (
                          <li key={i} className="text-sm text-foreground flex gap-2">
                            <span className="text-accent mt-1">•</span>
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.keyInsights.join("\n"))}
                      className="p-2 hover:bg-accent/10 rounded-md transition-colors flex-shrink-0"
                      title="Copy insights"
                    >
                      <Copy className="w-4 h-4 text-muted-foreground hover:text-accent" />
                    </button>
                  </div>
                </Card>

                {/* Risks */}
                <Card className="p-4 border border-destructive/40 bg-destructive/5 hover:bg-destructive/10 transition-all duration-200 hover:shadow-lg hover:shadow-destructive/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Risks
                      </h3>
                      <ul className="space-y-2">
                        {result.risks.map((risk, i) => (
                          <li key={i} className="text-sm text-foreground flex gap-2">
                            <span className="text-destructive mt-1">•</span>
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.risks.join("\n"))}
                      className="p-2 hover:bg-destructive/10 rounded-md transition-colors flex-shrink-0"
                      title="Copy risks"
                    >
                      <Copy className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </Card>

                {/* Opportunities */}
                <Card className="p-4 border border-accent/40 bg-card/60 hover:bg-card/80 transition-all duration-200 hover:shadow-lg hover:shadow-accent/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-accent mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Opportunities
                      </h3>
                      <ul className="space-y-2">
                        {result.opportunities.map((opp, i) => (
                          <li key={i} className="text-sm text-foreground flex gap-2">
                            <span className="text-accent mt-1">•</span>
                            <span>{opp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.opportunities.join("\n"))}
                      className="p-2 hover:bg-accent/10 rounded-md transition-colors flex-shrink-0"
                      title="Copy opportunities"
                    >
                      <Copy className="w-4 h-4 text-muted-foreground hover:text-accent" />
                    </button>
                  </div>
                </Card>

                {/* Recommended Actions */}
                <Card className="p-4 border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Recommended Actions
                      </h3>
                      <ul className="space-y-2">
                        {result.recommendedActions.map((action, i) => (
                          <li key={i} className="text-sm text-foreground flex gap-2">
                            <span className="text-primary mt-1">•</span>
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.recommendedActions.join("\n"))}
                      className="p-2 hover:bg-primary/10 rounded-md transition-colors flex-shrink-0"
                      title="Copy actions"
                    >
                      <Copy className="w-4 h-4 text-muted-foreground hover:text-primary" />
                    </button>
                  </div>
                </Card>

                {/* Copy All Button */}
                <Button
                  onClick={() => {
                    const allText = `BUSINESS STORY\n${result.story}\n\nKEY INSIGHTS\n${result.keyInsights.join("\n")}\n\nRISKS\n${result.risks.join("\n")}\n\nOPPORTUNITIES\n${result.opportunities.join("\n")}\n\nRECOMMENDED ACTIONS\n${result.recommendedActions.join("\n")}`;
                    copyToClipboard(allText);
                  }}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy All Results
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 mt-16 py-8 bg-background/50">
        <div className="container text-center text-sm text-muted-foreground">
          <p>DIVI STORY • Transform business data into narrative intelligence</p>
          <p className="mt-2 text-xs">Powered by OpenRouter AI</p>
        </div>
      </footer>
    </div>
  );
}
