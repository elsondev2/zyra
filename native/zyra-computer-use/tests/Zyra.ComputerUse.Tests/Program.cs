using System.Text.Json;
using Zyra.ComputerUse.Protocol;
using Zyra.ComputerUse.Security;

const string Secret = "0123456789abcdef0123456789abcdef";
var failures = new List<string>();

NamedPipeRpcHost Host() => new("zyra-computer-use-test", Secret, Path.Combine(Path.GetTempPath(), "zyra-computer-use-tests", Guid.NewGuid().ToString("N")));
RpcRequest Request(string method, string auth, object? parameters = null, int version = 1)
{
    using var document = JsonDocument.Parse(JsonSerializer.Serialize(parameters ?? new { }));
    return new RpcRequest(Guid.NewGuid().ToString("N"), method, document.RootElement.Clone(), auth, version);
}
async Task Check(string name, Func<Task> body)
{
    try { await body(); }
    catch (Exception error) { failures.Add($"{name}: {error.Message}"); }
}
void Equal<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new InvalidOperationException($"Expected {expected}; received {actual}.");
}

await Check("rejects unauthenticated requests", async () =>
{
    var response = await Host().HandleAsync(Request("health", "wrong-secret"));
    Equal(false, response.Ok);
    Equal("AUTHENTICATION_FAILED", response.Error?.Code);
});
await Check("rejects unsupported protocol versions", async () =>
{
    var response = await Host().HandleAsync(Request("health", Secret, version: 2));
    Equal("PROTOCOL_VERSION", response.Error?.Code);
});
await Check("rejects unknown methods", async () =>
{
    var response = await Host().HandleAsync(Request("raw_uia", Secret));
    Equal(false, response.Ok);
    Equal("UNKNOWN_OPERATION", response.Error?.Code);
});
await Check("protocol is bounded", () =>
{
    Equal(512 * 1024, NamedPipeRpcHost.MaxMessageBytes);
    return Task.CompletedTask;
});
await Check("sensitive application policy blocks credential, security, and payment targets", () =>
{
    Equal(true, ControlSecurityPolicy.IsSensitiveApplicationText("Windows Credential Manager"));
    Equal(true, ControlSecurityPolicy.IsSensitiveApplicationText("Payment Wallet"));
    Equal(false, ControlSecurityPolicy.IsSensitiveApplicationText("Notepad"));
    return Task.CompletedTask;
});
await Check("window selection rejects stale opaque tokens", async () =>
{
    var response = await Host().HandleAsync(Request("select_window", Secret, new { windowToken = "window-token:unknown" }));
    Equal(false, response.Ok);
    Equal("STALE_TARGET", response.Error?.Code);
});

if (failures.Count > 0)
{
    foreach (var failure in failures) Console.Error.WriteLine($"FAIL: {failure}");
    return 1;
}
Console.WriteLine("Zyra computer-use deterministic tests passed (6 checks).");
return 0;
