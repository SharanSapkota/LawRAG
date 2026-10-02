import { memo } from "react";
import { Icon, type IconName } from "./ui/Icon";

const EXAMPLE_QUESTIONS = [
  "What are the requirements for registering a private limited company?",
  "What notice must an employer give before terminating an employment contract?",
  "How is ancestral property divided among heirs?",
  "कम्पनी दर्ता गर्न के-के कागजात आवश्यक पर्छ?",
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "book", title: "Grounded in published law", text: "Answers draw only on documents in the firm's library." },
  { icon: "quote", title: "Section-level citations", text: "Every answer lists the passages it relied on." },
  { icon: "globe", title: "English or नेपाली", text: "Ask in either language; the answer follows yours." },
];

interface WelcomeScreenProps {
  onPickQuestion: (question: string) => void;
}

export const WelcomeScreen = memo(function WelcomeScreen({ onPickQuestion }: WelcomeScreenProps) {
  return (
    <div className="welcome">
      <div className="welcome-mark" aria-hidden="true">
        <Icon name="scale" size={26} />
      </div>
      <h1 className="welcome-title">What would you like to research?</h1>
      <p className="welcome-subtitle">
        Ask a question about Nepali law. You&apos;ll get a plain-language answer with citations to the
        specific sections it&apos;s based on.
      </p>

      <ul className="welcome-features">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <Icon name={feature.icon} size={18} />
            <div>
              <p className="welcome-feature-title">{feature.title}</p>
              <p className="welcome-feature-text">{feature.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="welcome-examples">
        <p className="welcome-examples-label">Try an example</p>
        <div className="welcome-examples-grid">
          {EXAMPLE_QUESTIONS.map((question) => (
            <button
              key={question}
              type="button"
              className="example-question"
              onClick={() => onPickQuestion(question)}
            >
              <Icon name="search" size={15} />
              <span>{question}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
