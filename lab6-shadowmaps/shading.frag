#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

///////////////////////////////////////////////////////////////////////////////
// Material
///////////////////////////////////////////////////////////////////////////////
uniform vec3 material_color;
uniform float material_reflectivity;
uniform float material_metalness;
uniform float material_fresnel;
uniform float material_shininess;
uniform float material_emission;

uniform int has_emission_texture;
layout(binding = 5) uniform sampler2D emissiveMap;

///////////////////////////////////////////////////////////////////////////////
// Environment
///////////////////////////////////////////////////////////////////////////////
layout(binding = 6) uniform sampler2D environmentMap;
layout(binding = 7) uniform sampler2D irradianceMap;
layout(binding = 8) uniform sampler2D reflectionMap;
uniform float environment_multiplier;

///////////////////////////////////////////////////////////////////////////////
// Light source
///////////////////////////////////////////////////////////////////////////////
uniform vec3 point_light_color = vec3(1.0, 1.0, 1.0);
uniform float point_light_intensity_multiplier = 50.0;

///////////////////////////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////////////////////////
#define PI 3.14159265359

///////////////////////////////////////////////////////////////////////////////
// Input varyings from vertex shader
///////////////////////////////////////////////////////////////////////////////
in vec2 texCoord;
in vec3 viewSpaceNormal;
in vec3 viewSpacePosition;

///////////////////////////////////////////////////////////////////////////////
// Input uniform variables
///////////////////////////////////////////////////////////////////////////////
uniform mat4 viewInverse;
uniform vec3 viewSpaceLightPosition;

///////////////////////////////////////////////////////////////////////////////
// Output color
///////////////////////////////////////////////////////////////////////////////
layout(location = 0) out vec4 fragmentColor;



vec3 calculateDirectIllumiunation(vec3 wo, vec3 n)
{
	///////////////////////////////////////////////////////////////////////////
	// Task 1.2 - Calculate the radiance Li from the light, and the direction
	//            to the light. If the light is backfacing the triangle,
	//            return vec3(0);
	///////////////////////////////////////////////////////////////////////////
	vec3 dVec = viewSpaceLightPosition - viewSpacePosition;
	float d = length(dVec);
	vec3 Li = point_light_intensity_multiplier * point_light_color / pow(d, 2);
	vec3 wi = normalize(dVec);
	if(dot(wi, n) <= 0)
	{
		return vec3(0);
	}

	///////////////////////////////////////////////////////////////////////////
	// Task 1.3 - Calculate the diffuse term and return that as the result
	///////////////////////////////////////////////////////////////////////////
	vec3 diffuse_term = material_color * abs(dot(wi, n)) * Li / PI;

	///////////////////////////////////////////////////////////////////////////
	// Task 2 - Calculate the Torrance Sparrow BRDF and return the light
	//          reflected from that instead
	///////////////////////////////////////////////////////////////////////////
	float s = material_shininess;
	float R0 = material_fresnel;

	vec3 wh = normalize(wi + wo);

	float dot_n_wh = dot(n, wh);
    float dot_n_wi = dot(n, wi);
	float dot_n_wo = dot(n, wo);
	float dot_wo_wh = dot(wo, wh);
	float dot_wh_wi = dot(wh, wi);

	float Fwi = R0 + (1 - R0) * pow( 1 - dot_wh_wi, 5);

	float Dwh = (s + 2) * pow(dot_n_wh, s) / (2*PI);

	float G = min(1, 2 * min(dot_n_wh * dot_n_wo / dot_wo_wh, dot_n_wh * dot_n_wi / dot_wo_wh));
	float brdf = Fwi * Dwh * G / (4 * dot_n_wo * dot_n_wi);

	///////////////////////////////////////////////////////////////////////////
	// Task 3 - Make your shader respect the parameters of our material model.
	///////////////////////////////////////////////////////////////////////////
	vec3 dielectric_term = brdf * dot_n_wi * Li + (1 - Fwi) * diffuse_term;
	vec3 metal_term = brdf * material_color * dot_n_wi * Li;

	float m = material_metalness;
	vec3 microfacet_term = m * metal_term + (1- m) * dielectric_term;

	float r = material_reflectivity;
	// return brdf * dot_n_wi * Li;
	return r * microfacet_term + (1-r) * diffuse_term;
}

vec3 calculateIndirectIllumination(vec3 wo, vec3 n)
{
	///////////////////////////////////////////////////////////////////////////
	// Task 5 - Lookup the irradiance from the irradiance map and calculate
	//          the diffuse reflection
	///////////////////////////////////////////////////////////////////////////
	vec3 nws = vec3 (viewInverse * vec4(n, 0.0f));

    // Calculate the world-space position of this fragment on the near plane
	vec4 pixel_world_pos = viewInverse * vec4(texCoord * 2.0 - 1.0, 1.0, 1.0);
	pixel_world_pos = (1.0 / pixel_world_pos.w) * pixel_world_pos;

	// vec3 camera_pos = vec3(viewInverse * vec4(0.0));

    // Calculate the world-space direction from the camera to that position
	vec3 dir = normalize(nws);

	float theta = acos(max(-1.0f, min(1.0f, dir.y)));
	float phi = atan(dir.z, dir.x);
	if(phi < 0.0f)
	{
		phi = phi + 2.0f * PI;
	}
	vec2 lookup = vec2(phi / (2.0 * PI), theta / PI);

	vec4 irradiance = environment_multiplier * texture(irradianceMap, lookup);
	vec4 diffuse_term = vec4 (material_color, 0) * (1.0 / PI) * irradiance;

	// return vec3(diffuse_term);
	///////////////////////////////////////////////////////////////////////////
	// Task 6 - Look up in the reflection map from the perfect specular
	//          direction and calculate the dielectric and metal terms.
	///////////////////////////////////////////////////////////////////////////

	vec3 wi = normalize(reflect(-wo, n));

	dir = normalize(vec3(viewInverse * vec4(wi, 0.0f)));

    // Calculate the spherical coordinates of the direction
	theta = acos(max(-1.0f, min(1.0f, dir.y)));
	phi = atan(dir.z, dir.x);
	if(phi < 0.0f)
	{
		phi = phi + 2.0f * PI;
	}

	// Use these to lookup the color in the environment map
	lookup = vec2(phi / (2.0 * PI), theta / PI);

	float s = material_shininess;
	float roughness = sqrt(sqrt(2/(s+2)));

	vec3 Li = environment_multiplier * textureLod(reflectionMap, lookup, roughness * 7.0).xyz; 

	vec3 wh = normalize(wi + wo);
	float dot_wh_wi = max(0.0, dot(wh, wi));

	float R0 = material_fresnel;
	float Fwi = R0 + (1.0 - R0) * pow((1.0 - dot_wh_wi), 5.0);

	vec3 dielectric_term = Fwi * Li + (1 - Fwi) * vec3(diffuse_term);
	vec3 metal_term = Fwi * material_color * Li;

	float m = material_metalness;
	vec3 microfacet_term = m * metal_term + (1 - m) * dielectric_term;

	float r = material_reflectivity;
	return  r * microfacet_term + (1 - r) * vec3(diffuse_term);	
}

void main()
{
	float visibility = 1.0;
	float attenuation = 1.0;


	vec3 wo = -normalize(viewSpacePosition);
	vec3 n = normalize(viewSpaceNormal);

	// Direct illumination
	vec3 direct_illumination_term = visibility * calculateDirectIllumiunation(wo, n);

	// Indirect illumination
	vec3 indirect_illumination_term = calculateIndirectIllumination(wo, n);

	///////////////////////////////////////////////////////////////////////////
	// Add emissive term. If emissive texture exists, sample this term.
	///////////////////////////////////////////////////////////////////////////
	vec3 emission_term = material_emission * material_color;
	if(has_emission_texture == 1)
	{
		emission_term = texture(emissiveMap, texCoord).xyz;
	}

	vec3 shading = direct_illumination_term + indirect_illumination_term + emission_term;

	fragmentColor = vec4(shading, 1.0);
	return;
}
