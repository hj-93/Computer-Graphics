#version 420

layout(location = 0) in vec3 position;
layout(location = 2) in vec2 texCoordIn;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
out vec2 texCoord;
// >>> @task 3.2

void main()
{
	texCoord = texCoordIn;
	vec4 pos = vec4(position.xyz - cameraPosition.xyz, 1);
	gl_Position = projectionMatrix * pos;

	// >>> @task 3.3
}