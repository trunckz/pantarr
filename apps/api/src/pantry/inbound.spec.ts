import { identityOf } from "../connectors/oauth/oauth";
import { gmailConfirmation, newCode, recipientCode } from "./inbound";

describe("forwarding address", () => {
  it("makes long codes without look-alike characters", () => {
    const c = newCode();
    expect(c).toMatch(/^[a-z2-9]{12}$/);
    expect(c).not.toMatch(/[01ilo]/);
    expect(newCode()).not.toBe(c);
  });
  it("finds the household code of a recipient of the instance's domain only", () => {
    expect(recipientCode("Tickets <K3x9P2m7Qa2b@tickets.example.com>", "tickets.example.com")).toBe("k3x9p2m7qa2b");
    expect(recipientCode("k3x9p2m7qa2b@other.example.com", "tickets.example.com")).toBeNull();
    expect(recipientCode("ab@tickets.example.com", "tickets.example.com")).toBeNull();
    expect(recipientCode("", "")).toBeNull();
  });
  it("reads Gmail's forwarding confirmation: code, link and account", () => {
    const c = gmailConfirmation("Gmail Team <forwarding-noreply@google.com>", "(#475830123) Confirmation de transfert Gmail - Recevoir des e-mails de famille.dupont@gmail.com",
      "famille.dupont@gmail.com a demandé à transférer automatiquement...\nCode de confirmation : 475830123\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc123 \n");
    expect(c).toEqual({ code: "475830123", link: "https://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc123", account: "famille.dupont@gmail.com" });
    expect(gmailConfirmation("E.Leclerc <commande@e-leclerc.com>", "(#123456789) Votre commande", "")).toBeNull();
  });
});

describe("sign-in with Google / Microsoft", () => {
  const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  it("trusts only the addresses checked by the provider", () => {
    expect(identityOf("google", token({ sub: "1", email: "A@gmail.com", email_verified: true, name: "Anne" }))).toEqual({ subject: "google:1", email: "a@gmail.com", name: "Anne", verified: true });
    expect(identityOf("google", token({ sub: "2", email: "b@x.fr", email_verified: false })).verified).toBe(false);
    // Microsoft: a personal account, or an address verified by the domain owner ; never a bare address of a directory (nOAuth)
    expect(identityOf("microsoft", token({ oid: "o3", tid: "9188040d-6c67-4c5b-b112-36a304b66dad", email: "c@outlook.fr" })))
      .toMatchObject({ subject: "microsoft:9188040d-6c67-4c5b-b112-36a304b66dad:o3", email: "c@outlook.fr", name: "c", verified: true });
    expect(identityOf("microsoft", token({ oid: "o4", tid: "attacker-tenant", email: "victim@example.com" })).verified).toBe(false);
    expect(identityOf("microsoft", token({ oid: "o5", tid: "company", email: "d@company.example", xms_edov: true })).verified).toBe(true);
    expect(identityOf("microsoft", token({ oid: "o6", tid: "company", preferred_username: "victim@example.com" }))).toMatchObject({ email: "", verified: false });
  });
});
