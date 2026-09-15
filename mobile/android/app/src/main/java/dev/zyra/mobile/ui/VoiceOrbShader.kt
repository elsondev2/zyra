package dev.zyra.mobile.ui

/** Native AGSL port of Desktop Strands.tsx's three strands and glass pass.
 * The glass pass samples the strand function directly instead of a second texture. */
internal const val VOICE_ORB_SHADER = """
uniform float2 resolution;
uniform float time;
uniform float energy;
uniform float active;
uniform float frequency;
uniform float phase;
uniform float3 primary;
uniform float3 secondary;
uniform float3 highlight;
float3 palette(float t) {
    float s = fract(t) * 3.0;
    if (s < 1.0) return mix(secondary, highlight, s);
    if (s < 2.0) return mix(highlight, primary, s - 1.0);
    return mix(primary, secondary, s - 2.0);
}
float3 strands(float2 p) {
    float2 uv = p / 1.3;
    float e = 0.06 + (mix(0.2, 0.42, active) + energy * 0.72) * 0.94;
    float env = pow(max(cos(uv.x * 3.14159265 * 1.3), 0.0), 3.0);
    float3 col = float3(0.0);
    for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float ph = fi * 1.7 * 2.4;
        float freq = (2.0 + fi * 0.35) * frequency;
        float spd = 1.4 + fi * 1.2;
        float w = sin(uv.x * freq + time * spd + ph) * 0.60
            + sin(uv.x * freq * 1.1 - time * spd * 0.7 + ph * 1.7) * 0.40;
        float y = w * (0.1 + 0.02 * e) * env * (0.72 + energy * 1.55);
        float thick = (0.001 + 0.05 * e) * (0.35 + env) * (0.45 + energy * 0.34);
        float g = thick / (abs(uv.y - y) + thick * 0.45);
        col += palette(fi / 3.0 + uv.x * 0.30 + time * 0.04 + phase / 6.2831853) * g * g * env;
    }
    col *= 0.45 + 0.7 * e;
    col = 1.0 - exp(-col * (2.35 + energy * 1.3));
    float gray = dot(col, float3(0.2126, 0.7152, 0.0722));
    return max(mix(float3(gray), col, 1.45), 0.0) * mix(0.76, 1.0, active);
}
half4 main(float2 coord) {
    float2 p = (coord - 0.5 * resolution) / resolution.y;
    p.y = -p.y;
    float d = length(p);
    float r = 0.4416;
    float edge = 1.5 / resolution.y;
    float mask = 1.0 - smoothstep(r - edge, r + edge, d);
    if (mask <= 0.0) return half4(0.0);
    float2 dir = d > 0.0 ? p / d : float2(0.0);
    float z = sqrt(max(r * r - d * d, 0.0)) / r;
    float nd = d / r;
    float lens = smoothstep(0.85, 1.0, nd) * pow(nd, 6.0);
    float2 offset = -dir * lens * 2.1 * 0.15;
    float2 disp = -dir * lens * 2.7 * 0.012;
    float3 light = float3(strands(p + offset - disp).r, strands(p + offset).g, strands(p + offset + disp).b);
    float fres = pow(1.0 - z, 3.0);
    float spec = pow(max(dot(p / r, normalize(float2(-0.55, 0.6))), 0.0), 6.0);
    spec *= 1.0 - smoothstep(r * 0.55, r, d);
    float3 col = light + float3(fres * 0.18 + spec * 0.4);
    float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
    a += (0.05 + fres * 0.05) * (1.0 - a);
    return half4(min(col, float3(a)) * mask, a * mask);
}
"""
