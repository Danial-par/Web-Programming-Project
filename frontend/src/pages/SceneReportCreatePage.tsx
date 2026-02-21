import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { CrimeLevel } from "../api/complaints";
import { SceneWitness, SceneReportCreatePayload, createSceneReport } from "../api/sceneReports";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { TextInput } from "../components/ui/TextInput";
import { useToast } from "../utils/toast";

const CRIME_LEVEL_OPTIONS: Array<{ value: CrimeLevel; label: string }> = [
  { value: "level_3", label: "Level 3" },
  { value: "level_2", label: "Level 2" },
  { value: "level_1", label: "Level 1" },
  { value: "critical", label: "Critical" }
];

interface SceneReportForm {
  title: string;
  description: string;
  crime_level: CrimeLevel;
  scene_datetime: string;
}

interface SceneReportErrors {
  title?: string;
  description?: string;
  crime_level?: string;
  scene_datetime?: string;
  witnesses?: string;
}

function toIsoDateTime(localValue: string): string | null {
  if (!localValue.trim()) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export const SceneReportCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [form, setForm] = useState<SceneReportForm>({
    title: "",
    description: "",
    crime_level: "level_3",
    scene_datetime: ""
  });
  const [witnesses, setWitnesses] = useState<SceneWitness[]>([{ phone: "", national_id: "" }]);
  const [errors, setErrors] = useState<SceneReportErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTextChange =
    (field: "title" | "description" | "scene_datetime") =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const updateWitness =
    (index: number, field: keyof SceneWitness) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setWitnesses((prev) =>
        prev.map((witness, witnessIndex) => (witnessIndex === index ? { ...witness, [field]: value } : witness))
      );
    };

  const addWitness = () => {
    setWitnesses((prev) => [...prev, { phone: "", national_id: "" }]);
  };

  const removeWitness = (index: number) => {
    setWitnesses((prev) => prev.filter((_, witnessIndex) => witnessIndex !== index));
  };

  const cleanWitnesses = (input: SceneWitness[]): { valid: SceneWitness[]; hasInvalidPartial: boolean } => {
    const trimmed = input.map((witness) => ({
      phone: witness.phone.trim(),
      national_id: witness.national_id.trim()
    }));

    let hasInvalidPartial = false;
    const valid: SceneWitness[] = [];
    for (const witness of trimmed) {
      const hasPhone = witness.phone.length > 0;
      const hasNationalId = witness.national_id.length > 0;

      if (!hasPhone && !hasNationalId) {
        continue;
      }
      if (!(hasPhone && hasNationalId)) {
        hasInvalidPartial = true;
        continue;
      }
      valid.push(witness);
    }
    return { valid, hasInvalidPartial };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSubmitError(null);

    const nextErrors: SceneReportErrors = {};
    if (!form.title.trim()) nextErrors.title = "Title is required.";
    if (!form.description.trim()) nextErrors.description = "Description is required.";
    if (!form.crime_level) nextErrors.crime_level = "Crime level is required.";

    const sceneDateIso = toIsoDateTime(form.scene_datetime);
    if (!sceneDateIso) nextErrors.scene_datetime = "A valid scene date/time is required.";

    const { valid: cleanedWitnesses, hasInvalidPartial } = cleanWitnesses(witnesses);
    if (hasInvalidPartial) {
      nextErrors.witnesses = "Each witness row must include both phone and national ID, or be left completely empty.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const payload: SceneReportCreatePayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      crime_level: form.crime_level,
      scene_datetime: sceneDateIso as string
    };
    if (cleanedWitnesses.length > 0) {
      payload.witnesses = cleanedWitnesses;
    }

    setIsSubmitting(true);
    try {
      const created = await createSceneReport(payload);
      showSuccess(`Scene report #${created.id} created.`);
      navigate(`/scene-reports/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldMap = (err.fields ?? {}) as Record<string, unknown>;
        const mappedErrors: SceneReportErrors = {};

        if (fieldMap.title) mappedErrors.title = Array.isArray(fieldMap.title) ? fieldMap.title.join(" ") : String(fieldMap.title);
        if (fieldMap.description) {
          mappedErrors.description = Array.isArray(fieldMap.description)
            ? fieldMap.description.join(" ")
            : String(fieldMap.description);
        }
        if (fieldMap.crime_level) {
          mappedErrors.crime_level = Array.isArray(fieldMap.crime_level)
            ? fieldMap.crime_level.join(" ")
            : String(fieldMap.crime_level);
        }
        if (fieldMap.scene_datetime) {
          mappedErrors.scene_datetime = Array.isArray(fieldMap.scene_datetime)
            ? fieldMap.scene_datetime.join(" ")
            : String(fieldMap.scene_datetime);
        }
        if (fieldMap.witnesses) {
          mappedErrors.witnesses = Array.isArray(fieldMap.witnesses)
            ? fieldMap.witnesses.join(" ")
            : String(fieldMap.witnesses);
        }
        if (Object.keys(mappedErrors).length > 0) setErrors(mappedErrors);

        const message = err.message || "Failed to create scene report.";
        setSubmitError(message);
        showError(message);
      } else {
        setSubmitError("Failed to create scene report.");
        showError("Failed to create scene report.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="workflow-stack">
      <section className="workflow-header">
        <div>
          <h1 style={{ marginTop: 0 }}>New Scene Report</h1>
          <p className="workflow-muted">
            Submit a scene report to form a draft case. Approvers can later activate it.
          </p>
        </div>
        <Link to="/scene-reports">
          <Button type="button" variant="secondary">
            Back to List
          </Button>
        </Link>
      </section>

      <Card title="Scene report form">
        <form className="workflow-form" onSubmit={handleSubmit}>
          <TextInput label="Title" value={form.title} onChange={handleTextChange("title")} error={errors.title} />
          <div className="workflow-field">
            <label className="ui-field__label" htmlFor="scene-description">
              Description
            </label>
            <textarea
              id="scene-description"
              className="ui-textarea"
              rows={4}
              value={form.description}
              onChange={handleTextChange("description")}
            />
            {errors.description && <div className="ui-field__error">{errors.description}</div>}
          </div>
          <Select
            label="Crime level"
            value={form.crime_level}
            onChange={(event) => setForm((prev) => ({ ...prev, crime_level: event.target.value as CrimeLevel }))}
            options={CRIME_LEVEL_OPTIONS}
            error={errors.crime_level}
          />
          <TextInput
            label="Scene date/time"
            type="datetime-local"
            value={form.scene_datetime}
            onChange={handleTextChange("scene_datetime")}
            error={errors.scene_datetime}
          />

          <div className="workflow-fieldset">
            <div className="workflow-fieldset__header">
              <div className="ui-field__label">Witnesses (optional)</div>
              <Button type="button" variant="secondary" onClick={addWitness}>
                Add Witness
              </Button>
            </div>

            <div className="witness-list">
              {witnesses.map((witness, index) => (
                <div className="witness-row" key={`witness-${index}`}>
                  <TextInput
                    label={`Phone #${index + 1}`}
                    value={witness.phone}
                    onChange={updateWitness(index, "phone")}
                    placeholder="0912..."
                  />
                  <TextInput
                    label={`National ID #${index + 1}`}
                    value={witness.national_id}
                    onChange={updateWitness(index, "national_id")}
                    placeholder="10 digits"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeWitness(index)}
                    disabled={witnesses.length <= 1}
                    className="witness-row__remove"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            {errors.witnesses && <div className="ui-field__error">{errors.witnesses}</div>}
          </div>

          {submitError && (
            <Alert variant="error" title="Create failed">
              {submitError}
            </Alert>
          )}

          <div className="workflow-actions">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Create Scene Report"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
